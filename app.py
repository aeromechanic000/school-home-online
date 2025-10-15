from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
import json
import os
import uuid
from datetime import datetime, timedelta
import threading
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*")

# Ensure data directories exist
os.makedirs('data/scenes', exist_ok=True)
os.makedirs('data/characters', exist_ok=True)
os.makedirs('static/assets/characters', exist_ok=True)
os.makedirs('static/assets/scenes', exist_ok=True)
os.makedirs('static/assets/items', exist_ok=True)
os.makedirs('static/musics', exist_ok=True)

# Global game state
connected_players = {}
game_state = {
    'players': {},
    'ai_characters': {},
    'ai_players': {}
}

# Load game configuration
def load_game_config():
    config_path = 'data/game.json'
    if not os.path.exists(config_path):
        default_config = {
            'bag_size': 10,
            'tile_size': 64,
            'view_width': 15,
            'view_height': 11,
            'interaction_distance': 2,
            'game_speed': 1.0,
            'day_length_seconds': 300
        }
        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=2)
        return default_config
    
    with open(config_path, 'r') as f:
        return json.load(f)

game_config = load_game_config()

# Load valid tokens
def load_valid_tokens():
    tokens_path = 'data/tokens.json'
    if not os.path.exists(tokens_path):
        # Create default tokens file with sample tokens
        default_tokens = {
            'valid_tokens': [
                {
                    'token': 'demo-token-123',
                    'user_id': 'user_001',
                    'created_at': datetime.now().isoformat(),
                    'description': 'Demo token for testing'
                },
                {
                    'token': 'player-token-456',
                    'user_id': 'user_002',
                    'created_at': datetime.now().isoformat(),
                    'description': 'Player token'
                }
            ]
        }
        with open(tokens_path, 'w') as f:
            json.dump(default_tokens, f, indent=2)
        return default_tokens
    
    with open(tokens_path, 'r') as f:
        return json.load(f)

valid_tokens_data = load_valid_tokens()

# Create a mapping of token -> user_id
valid_tokens = {
    token_data['token']: token_data['user_id'] 
    for token_data in valid_tokens_data['valid_tokens']
}

# Load scene data
def load_scene(scene_name):
    scene_path = f'data/scenes/{scene_name}.json'
    if not os.path.exists(scene_path):
        # Create default scene
        default_scene = {
            'name': scene_name,
            'width': 30,
            'height': 20,
            'floor_texture': 'grass.png',
            'items': [],
            'spawn_points': [{'x': 5, 'y': 5}]
        }
        with open(scene_path, 'w') as f:
            json.dump(default_scene, f, indent=2)
        return default_scene
    
    with open(scene_path, 'r') as f:
        return json.load(f)

# Load character data
def load_character(character_name, is_ai=True):
    char_path = f'data/characters/{character_name}.json'
    if not os.path.exists(char_path):
        default_char = {
            'name': character_name,
            'type': 'ai_character' if is_ai else 'ai_player',
            'sprite': 'character1.png',
            'energy': 100,
            'happiness': 100,
            'health': 100,
            'position': {'x': 5, 'y': 5, 'scene': 'campus'},
            'memory': [],
            'rules': {
                'low_energy': {'threshold': 30, 'action': 'rest'},
                'low_happiness': {'threshold': 30, 'action': 'socialize'},
                'low_health': {'threshold': 30, 'action': 'eat'}
            },
            'bag': []
        }
        with open(char_path, 'w') as f:
            json.dump(default_char, f, indent=2)
        return default_char
    
    with open(char_path, 'r') as f:
        return json.load(f)

# Save character data
def save_character(character_name, character_data):
    char_path = f'data/characters/{character_name}.json'
    with open(char_path, 'w') as f:
        json.dump(character_data, f, indent=2)

# Initialize AI characters and players
def initialize_ai_entities():
    # Load AI characters
    ai_chars = ['librarian', 'chef', 'coach']
    for char_name in ai_chars:
        char_data = load_character(char_name, is_ai=True)
        game_state['ai_characters'][char_name] = char_data
    
    # Load AI players
    ai_players = ['alice_ai', 'bob_ai']
    for player_name in ai_players:
        player_data = load_character(player_name, is_ai=False)
        player_data['type'] = 'ai_player'
        game_state['ai_players'][player_name] = player_data

initialize_ai_entities()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    token = data.get('token')
    
    if not token:
        return jsonify({'success': False, 'error': 'Token is required'}), 400
    
    if token not in valid_tokens:
        return jsonify({'success': False, 'error': 'Invalid token'}), 401
    
    user_id = valid_tokens[token]
    
    return jsonify({
        'success': True,
        'token': token,
        'user_id': user_id,
        'game_config': game_config
    })

@app.route('/api/user/profile', methods=['GET', 'POST'])
def user_profile():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    
    if token not in valid_tokens:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = valid_tokens[token]
    
    if request.method == 'GET':
        # Return current profile from connected players or default
        if user_id in game_state['players']:
            return jsonify(game_state['players'][user_id])
        return jsonify({
            'user_id': user_id,
            'nickname': f'Player_{user_id[:8]}',
            'sprite': 'character1.png'
        })
    
    elif request.method == 'POST':
        data = request.json
        if user_id in game_state['players']:
            game_state['players'][user_id]['nickname'] = data.get('nickname', game_state['players'][user_id]['nickname'])
            game_state['players'][user_id]['sprite'] = data.get('sprite', game_state['players'][user_id]['sprite'])
        
        return jsonify({'success': True})

@app.route('/api/scenes/<scene_name>')
def get_scene(scene_name):
    scene_data = load_scene(scene_name)
    return jsonify(scene_data)

@app.route('/api/characters/list')
def list_characters():
    chars_dir = 'static/assets/characters'
    if os.path.exists(chars_dir):
        characters = [f for f in os.listdir(chars_dir) if f.endswith('.png')]
        return jsonify({'characters': characters})
    return jsonify({'characters': []})

# WebSocket events
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    # Remove player from game state
    for user_id, player_data in list(game_state['players'].items()):
        if player_data.get('socket_id') == request.sid:
            del game_state['players'][user_id]
            emit('player_disconnected', {'user_id': user_id}, broadcast=True)
            break
    print(f'Client disconnected: {request.sid}')

@socketio.on('join_game')
def handle_join_game(data):
    token = data.get('token')
    
    if token not in valid_tokens:
        emit('error', {'message': 'Invalid token'})
        return
    
    user_id = valid_tokens[token]
    
    # Initialize player data
    player_data = {
        'user_id': user_id,
        'socket_id': request.sid,
        'nickname': data.get('nickname', f'Player_{user_id[:8]}'),
        'sprite': data.get('sprite', 'character1.png'),
        'type': 'human_player',
        'energy': data.get('energy', 100),
        'happiness': data.get('happiness', 100),
        'health': data.get('health', 100),
        'position': data.get('position', {'x': 5, 'y': 5, 'scene': 'campus'}),
        'bag': data.get('bag', []),
        'direction': 'down',
        'animation_frame': 0
    }
    
    game_state['players'][user_id] = player_data
    
    # Send current game state to the new player
    emit('game_state', {
        'players': game_state['players'],
        'ai_characters': game_state['ai_characters'],
        'ai_players': game_state['ai_players'],
        'your_id': user_id
    })
    
    # Notify other players
    emit('player_joined', player_data, broadcast=True, include_self=False)

@socketio.on('player_move')
def handle_player_move(data):
    user_id = data.get('user_id')
    
    if user_id in game_state['players']:
        game_state['players'][user_id]['position'] = data.get('position')
        game_state['players'][user_id]['direction'] = data.get('direction', 'down')
        game_state['players'][user_id]['animation_frame'] = data.get('animation_frame', 0)
        
        # Broadcast to other players
        emit('player_moved', {
            'user_id': user_id,
            'position': data.get('position'),
            'direction': data.get('direction'),
            'animation_frame': data.get('animation_frame')
        }, broadcast=True, include_self=False)

@socketio.on('interact_item')
def handle_interact_item(data):
    user_id = data.get('user_id')
    item = data.get('item')
    scene_name = data.get('scene')
    
    # Load scene and validate interaction
    scene = load_scene(scene_name)
    
    # Process interaction
    interaction_result = {
        'type': item.get('interaction', {}).get('type'),
        'data': item.get('interaction', {}),
        'item_name': item.get('name')  # Include item name for message bubbles
    }
    
    # Update player status based on interaction
    if user_id in game_state['players']:
        status_changes = item.get('interaction', {}).get('status_changes', {})
        for stat, change in status_changes.items():
            if stat in game_state['players'][user_id]:
                game_state['players'][user_id][stat] = max(0, min(100, 
                    game_state['players'][user_id][stat] + change))
        
        # Handle bag items
        bag_changes = item.get('interaction', {}).get('bag_changes', [])
        for bag_item in bag_changes:
            if len(game_state['players'][user_id]['bag']) < game_config['bag_size']:
                game_state['players'][user_id]['bag'].append(bag_item)
    
    emit('interaction_result', interaction_result)
    
    # Broadcast status update
    if user_id in game_state['players']:
        emit('player_status_update', {
            'user_id': user_id,
            'energy': game_state['players'][user_id]['energy'],
            'happiness': game_state['players'][user_id]['happiness'],
            'health': game_state['players'][user_id]['health']
        }, broadcast=True)

@socketio.on('chat_message')
def handle_chat_message(data):
    user_id = data.get('user_id')
    message = data.get('message')
    target_id = data.get('target_id')
    
    # Get sender's nickname
    from_nickname = 'Unknown'
    if user_id in game_state['players']:
        from_nickname = game_state['players'][user_id].get('nickname', f'Player_{user_id[:8]}')
    
    chat_data = {
        'from': user_id,
        'from_nickname': from_nickname,  # Add nickname to chat data
        'to': target_id,
        'message': message,
        'timestamp': datetime.now().isoformat()
    }
    
    # Broadcast to ALL connected clients (not just sender)
    if target_id:
        # Private message - send to target only
        if target_id in game_state['players']:
            target_socket = game_state['players'][target_id].get('socket_id')
            if target_socket:
                emit('chat_message', chat_data, room=target_socket)
        # Also send to sender
        emit('chat_message', chat_data)
    else:
        # Global message - broadcast to everyone
        emit('chat_message', chat_data, broadcast=True)

@socketio.on('update_status')
def handle_update_status(data):
    user_id = data.get('user_id')
    
    if user_id in game_state['players']:
        if 'energy' in data:
            game_state['players'][user_id]['energy'] = max(0, min(100, data['energy']))
        if 'happiness' in data:
            game_state['players'][user_id]['happiness'] = max(0, min(100, data['happiness']))
        if 'health' in data:
            game_state['players'][user_id]['health'] = max(0, min(100, data['health']))
        
        # Broadcast update
        emit('player_status_update', {
            'user_id': user_id,
            'energy': game_state['players'][user_id]['energy'],
            'happiness': game_state['players'][user_id]['happiness'],
            'health': game_state['players'][user_id]['health']
        }, broadcast=True)

# AI update loop (runs in background)
def ai_update_loop():
    while True:
        time.sleep(5)  # Update every 5 seconds
        
        # Update AI characters and players
        for char_name, char_data in game_state['ai_characters'].items():
            # Simple AI behavior
            if char_data['energy'] < char_data['rules']['low_energy']['threshold']:
                char_data['energy'] = min(100, char_data['energy'] + 5)
            
            save_character(char_name, char_data)
        
        for player_name, player_data in game_state['ai_players'].items():
            # Simple AI player behavior
            if player_data['energy'] < player_data['rules']['low_energy']['threshold']:
                player_data['energy'] = min(100, player_data['energy'] + 5)
            
            # Random movement
            import random
            player_data['position']['x'] += random.choice([-1, 0, 1])
            player_data['position']['y'] += random.choice([-1, 0, 1])
            
            save_character(player_name, player_data)
        
        # Broadcast AI updates
        socketio.emit('ai_update', {
            'ai_characters': game_state['ai_characters'],
            'ai_players': game_state['ai_players']
        })

# Start AI update thread
ai_thread = threading.Thread(target=ai_update_loop, daemon=True)
ai_thread.start()

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5151)