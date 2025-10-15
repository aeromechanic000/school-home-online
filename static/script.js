// Game State
const gameState = {
    token: null,
    userId: null,
    nickname: '',
    sprite: 'character1.png',
    position: { x: 5, y: 5, scene: 'campus' },
    energy: 100,
    happiness: 100,
    health: 100,
    bag: [],
    players: {},
    aiCharacters: {},
    aiPlayers: {},
    currentScene: null,
    gameConfig: null,
    chatHistory: [],
    isChatFocused: false,
    interactionHistory: [],  // NEW: Store interaction history
    musicEnabled: true,      // NEW: Music state
    characterMessages: {}     // NEW: Store character messages for display
};

// Socket connection
let socket = null;

// Canvas and rendering
const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// Keyboard state
const keys = {};

// Images cache
const imageCache = {};

// Animation
let animationFrame = 0;
let lastFrameTime = 0;
const FRAME_DURATION = 200; // ms per frame

// Game loop
let gameLoopId = null;

// Background music
let bgMusic = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeLoginScreen();
    loadFromLocalStorage();
    initializeBgMusic();
});

// Initialize background music
function initializeBgMusic() {
    bgMusic = new Audio('/static/musics/bg.mp3');
    bgMusic.loop = true;
    bgMusic.volume = 0.3;
}

// Toggle music
function toggleMusic() {
    gameState.musicEnabled = !gameState.musicEnabled;
    
    const musicBtn = document.getElementById('music-toggle-btn');
    if (musicBtn) {
        musicBtn.textContent = gameState.musicEnabled ? '🔊' : '🔇';
    }
    
    if (gameState.musicEnabled) {
        bgMusic.play().catch(err => console.log('Music play failed:', err));
    } else {
        bgMusic.pause();
    }
    
    saveToLocalStorage();
}

// Load from local storage
function loadFromLocalStorage() {
    const savedToken = localStorage.getItem('aitown_token');
    const savedProfile = localStorage.getItem('aitown_profile');
    const savedChatHistory = localStorage.getItem('aitown_chat_history');
    const savedInteractionHistory = localStorage.getItem('aitown_interaction_history');
    const savedMusicEnabled = localStorage.getItem('aitown_music_enabled');
    
    if (savedToken) {
        gameState.token = savedToken;
    }
    
    if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        gameState.nickname = profile.nickname || '';
        gameState.sprite = profile.sprite || 'character1.png';
        gameState.energy = profile.energy || 100;
        gameState.happiness = profile.happiness || 100;
        gameState.health = profile.health || 100;
        gameState.bag = profile.bag || [];
        gameState.position = profile.position || { x: 5, y: 5, scene: 'campus' };
    }
    
    if (savedChatHistory) {
        gameState.chatHistory = JSON.parse(savedChatHistory);
    }
    
    if (savedInteractionHistory) {
        gameState.interactionHistory = JSON.parse(savedInteractionHistory);
    }
    
    if (savedMusicEnabled) {
        gameState.musicEnabled = JSON.parse(savedMusicEnabled);
    } else {
        gameState.musicEnabled = true;
    }
}

// Save to local storage
function saveToLocalStorage() {
    if (gameState.token) {
        localStorage.setItem('aitown_token', gameState.token);
    }
    
    const profile = {
        nickname: gameState.nickname,
        sprite: gameState.sprite,
        energy: gameState.energy,
        happiness: gameState.happiness,
        health: gameState.health,
        bag: gameState.bag,
        position: gameState.position
    };
    localStorage.setItem('aitown_profile', JSON.stringify(profile));
    localStorage.setItem('aitown_chat_history', JSON.stringify(gameState.chatHistory));
    localStorage.setItem('aitown_interaction_history', JSON.stringify(gameState.interactionHistory));
    localStorage.setItem('aitown_music_enabled', JSON.stringify(gameState.musicEnabled));
}

// Initialize Login Screen
function initializeLoginScreen() {
    const loginBtn = document.getElementById('login-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const token = document.getElementById('token-input').value.trim();
            if (!token) {
                alert('Please enter a token to login.');
                return;
            }
            login(token);
        });
    }
    
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            alert('Please enter a valid token. Contact admin for new tokens.');
        });
    }
}

// Login
async function login(token) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: token })
        });
        
        const data = await response.json();
        
        if (data.success) {
            gameState.token = data.token;
            gameState.userId = data.user_id;
            gameState.gameConfig = data.game_config;
            
            saveToLocalStorage();
            showProfileScreen();
        } else {
            alert('Login failed: ' + (data.error || 'Invalid token'));
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Connection error. Please try again.');
    }
}

// Show Profile Screen
async function showProfileScreen() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('profile-screen').classList.remove('hidden');
    
    // Load available characters
    await loadCharacters();
    
    // Set current values
    document.getElementById('nickname-input').value = gameState.nickname || `Player_${gameState.userId.substring(0, 8)}`;
    
    // Save profile button
    const saveBtn = document.getElementById('save-profile-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveProfile);
    }
}

// Load available characters
async function loadCharacters() {
    try {
        const response = await fetch('/api/characters/list');
        const data = await response.json();
        
        const selector = document.getElementById('character-selector');
        selector.innerHTML = '';

        console.log('Available characters:', data.characters);
        
        if (data.characters && data.characters.length > 0) {
            for (const char of data.characters) {
                // Preload the sprite first
                const spritePath = `/static/assets/characters/${char}`;
                
                try {
                    const spriteImg = await loadImage(spritePath);
                    
                    const option = document.createElement('div');
                    option.className = 'character-option';
                    if (char === gameState.sprite) {
                        option.classList.add('selected');
                    }
                    
                    // Create a canvas to extract just the front-facing center frame
                    const canvas = document.createElement('canvas');
                    canvas.width = 32;  // Single frame width
                    canvas.height = 32; // Single frame height
                    const ctx = canvas.getContext('2d');
                    
                    // Draw only the center frame of row 0 (front-facing, middle frame)
                    // Row 0 = down/front facing, Column 1 = center frame
                    ctx.drawImage(
                        spriteImg,
                        32, 0,      // Source: column 1 (center), row 0 (front)
                        32, 32,     // Source size: 32x32
                        0, 0,       // Destination: 0, 0
                        32, 32      // Destination size: 32x32
                    );
                    
                    // Convert canvas to image
                    const img = document.createElement('img');
                    img.src = canvas.toDataURL();
                    img.alt = char;
                    img.style.imageRendering = 'pixelated';
                    option.appendChild(img);
                    
                    option.addEventListener('click', () => {
                        document.querySelectorAll('.character-option').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                        option.classList.add('selected');
                        gameState.sprite = char;
                    });
                    
                    selector.appendChild(option);
                } catch (error) {
                    console.warn('Failed to load character sprite:', char, error);
                }
            }
        } else {
            selector.innerHTML = '<p class="pixel-text">No characters available. Please add sprite sheets to static/assets/characters/</p>';
        }
    } catch (error) {
        console.error('Error loading characters:', error);
    }
}

// Save Profile
function saveProfile() {
    gameState.nickname = document.getElementById('nickname-input').value.trim() || `Player_${gameState.userId.substring(0, 8)}`;
    
    saveToLocalStorage();
    startGame();
}

// Start Game
async function startGame() {
    document.getElementById('profile-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    console.log('Starting game with sprite:', gameState.sprite);
    
    // Preload player sprite BEFORE starting game
    const spritePath = `/static/assets/characters/${gameState.sprite}`;
    console.log('Attempting to load sprite:', spritePath);
    
    try {
        const img = await loadImage(spritePath);
        console.log('✓ Player sprite loaded successfully');
        console.log('  - Width:', img.width, 'Height:', img.height);
        console.log('  - Natural Width:', img.naturalWidth, 'Natural Height:', img.naturalHeight);
    } catch (error) {
        console.error('✗ Failed to load player sprite:', error);
        alert('Warning: Failed to load character sprite. Using fallback graphics.\nPath: ' + spritePath);
    }
    
    // Preload all available character sprites
    try {
        const response = await fetch('/api/characters/list');
        const data = await response.json();
        if (data.characters && data.characters.length > 0) {
            console.log('Preloading all character sprites...');
            for (const charSprite of data.characters) {
                await preloadCharacterSprite(charSprite);
            }
            console.log('✓ All character sprites preloaded');
        }
    } catch (error) {
        console.warn('⚠️ Failed to preload all character sprites:', error);
    }
    
    // Initialize socket connection
    connectToServer();
    
    // Load initial scene (await it!)
    await loadScene(gameState.position.scene);
    
    // Setup controls
    setupControls();
    
    // Setup chat
    setupChat();
    
    // Setup music toggle
    setupMusicToggle();
    
    // Update UI
    updateStatusBars();
    
    // Restore interaction history
    restoreInteractionHistory();
    
    // Start game loop
    startGameLoop();
}

// Setup music toggle
function setupMusicToggle() {
    const musicBtn = document.getElementById('music-toggle-btn');
    if (musicBtn) {
        musicBtn.textContent = gameState.musicEnabled ? '🔊' : '🔇';
        musicBtn.addEventListener('click', toggleMusic);
        
        // Auto-play if enabled
        if (gameState.musicEnabled) {
            bgMusic.play().catch(err => console.log('Music autoplay failed:', err));
        }
    }
}

// Connect to server
function connectToServer() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        
        // Join game
        socket.emit('join_game', {
            token: gameState.token,
            nickname: gameState.nickname,
            sprite: gameState.sprite,
            energy: gameState.energy,
            happiness: gameState.happiness,
            health: gameState.health,
            position: gameState.position,
            bag: gameState.bag
        });
    });
    
    socket.on('game_state', async (data) => {
        console.log('Received game state:', data);
        gameState.players = data.players || {};
        gameState.aiCharacters = data.ai_characters || {};
        gameState.aiPlayers = data.ai_players || {};
        gameState.userId = data.your_id;
        
        // Preload all player sprites
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            if (player.sprite) {
                await preloadCharacterSprite(player.sprite);
            }
        }
        
        // Preload all AI player sprites
        for (const aiId in gameState.aiPlayers) {
            const aiPlayer = gameState.aiPlayers[aiId];
            if (aiPlayer.sprite) {
                await preloadCharacterSprite(aiPlayer.sprite);
            }
        }
        
        // Preload all AI character sprites
        for (const charId in gameState.aiCharacters) {
            const aiChar = gameState.aiCharacters[charId];
            if (aiChar.sprite) {
                await preloadCharacterSprite(aiChar.sprite);
            }
        }
    });
    
    socket.on('player_joined', async (player) => {
        console.log('Player joined:', player);
        gameState.players[player.user_id] = player;
        
        // Preload the new player's sprite
        if (player.sprite) {
            await preloadCharacterSprite(player.sprite);
        }
        
        addChatMessage('System', `${player.nickname} joined the game`);
    });
    
    socket.on('player_disconnected', (data) => {
        console.log('Player disconnected:', data);
        const player = gameState.players[data.user_id];
        if (player) {
            addChatMessage('System', `${player.nickname} left the game`);
            delete gameState.players[data.user_id];
        }
    });
    
    socket.on('player_moved', (data) => {
        if (gameState.players[data.user_id]) {
            gameState.players[data.user_id].position = data.position;
            gameState.players[data.user_id].direction = data.direction;
            gameState.players[data.user_id].animation_frame = data.animation_frame;
        }
    });
    
    socket.on('player_status_update', (data) => {
        if (data.user_id === gameState.userId) {
            gameState.energy = data.energy;
            gameState.happiness = data.happiness;
            gameState.health = data.health;
            updateStatusBars();
            saveToLocalStorage();
        }
        
        if (gameState.players[data.user_id]) {
            gameState.players[data.user_id].energy = data.energy;
            gameState.players[data.user_id].happiness = data.happiness;
            gameState.players[data.user_id].health = data.health;
        }
    });
    
    socket.on('interaction_result', (data) => {
        displayInteraction(data);
    });
    
    socket.on('chat_message', (data) => {
        handleChatMessage(data);
    });
    
    socket.on('ai_update', async (data) => {
        gameState.aiCharacters = data.ai_characters || {};
        gameState.aiPlayers = data.ai_players || {};
        
        // Preload new AI player sprites
        for (const aiId in gameState.aiPlayers) {
            const aiPlayer = gameState.aiPlayers[aiId];
            if (aiPlayer.sprite) {
                await preloadCharacterSprite(aiPlayer.sprite);
            }
        }
        
        // Preload new AI character sprites
        for (const charId in gameState.aiCharacters) {
            const aiChar = gameState.aiCharacters[charId];
            if (aiChar.sprite) {
                await preloadCharacterSprite(aiChar.sprite);
            }
        }
    });
    
    socket.on('error', (data) => {
        console.error('Socket error:', data);
        alert(data.message);
    });
}

// Load scene
async function loadScene(sceneName) {
    try {
        const response = await fetch(`/api/scenes/${sceneName}`);
        gameState.currentScene = await response.json();
        console.log('Loaded scene:', gameState.currentScene);
        
        // Preload scene textures
        if (gameState.currentScene.floor_texture) {
            await loadImage(`/static/assets/scenes/${gameState.currentScene.floor_texture}`);
        }
        
        // Preload item images
        if (gameState.currentScene.items) {
            for (const item of gameState.currentScene.items) {
                if (item.image) {
                    await loadImage(`/static/assets/items/${item.image}`);
                }
            }
        }
    } catch (error) {
        console.error('Error loading scene:', error);
    }
}

// Load image
function loadImage(src) {
    return new Promise((resolve, reject) => {
        if (imageCache[src]) {
            console.log('Image already cached:', src);
            resolve(imageCache[src]);
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            imageCache[src] = img;
            console.log('✓ Loaded:', src, `(${img.width}x${img.height})`);
            resolve(img);
        };
        img.onerror = (error) => {
            console.error('✗ Failed to load:', src, error);
            reject(error);
        };
        img.src = src;
    });
}

// Preload character sprite
async function preloadCharacterSprite(spriteName) {
    if (!spriteName) return;
    
    const spritePath = `/static/assets/characters/${spriteName}`;
    
    // Check if already cached
    if (imageCache[spritePath]) {
        return;
    }
    
    try {
        await loadImage(spritePath);
        console.log('✓ Preloaded character sprite:', spriteName);
    } catch (error) {
        console.warn('⚠️ Failed to preload character sprite:', spriteName, error);
    }
}

// Setup controls
function setupControls() {
    document.addEventListener('keydown', (e) => {
        // Don't process game controls if chat is focused
        if (gameState.isChatFocused) {
            // Only allow Enter key to send message
            if (e.key === 'Enter') {
                const chatInput = document.getElementById('chat-input');
                if (chatInput && document.activeElement === chatInput) {
                    sendChatMessage();
                    e.preventDefault();
                }
            }
            return; // Ignore all other keys when chat is focused
        }
        
        keys[e.key.toLowerCase()] = true;
        
        // Interaction key
        if (e.key.toLowerCase() === 'e') {
            checkInteraction();
        }
        
        // Bag key
        if (e.key.toLowerCase() === 'b') {
            toggleBag();
        }
        
        // If movement keys are pressed, blur chat input
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
            const chatInput = document.getElementById('chat-input');
            if (chatInput && document.activeElement === chatInput) {
                chatInput.blur();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        // Don't process if chat is focused
        if (gameState.isChatFocused) {
            return;
        }
        
        keys[e.key.toLowerCase()] = false;
    });
}

// Setup chat
function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-chat-btn');
    
    // Track focus state
    if (chatInput) {
        chatInput.addEventListener('focus', () => {
            gameState.isChatFocused = true;
            console.log('Chat focused - movement disabled');
        });
        
        chatInput.addEventListener('blur', () => {
            gameState.isChatFocused = false;
            console.log('Chat blurred - movement enabled');
        });
        
        // Handle Enter key
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
                e.preventDefault();
            }
        });
        
        // Handle Escape key to blur
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                chatInput.blur();
                e.preventDefault();
            }
        });
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendChatMessage);
    }
    
    // Restore chat history
    gameState.chatHistory.forEach(msg => {
        displayChatMessage(msg);
    });
}

function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    
    if (message && socket) {
        socket.emit('chat_message', {
            user_id: gameState.userId,
            message: message,
            target_id: null
        });
        chatInput.value = '';
    }
}

// Handle chat message
function handleChatMessage(data) {
    const msg = {
        from: data.from,
        from_nickname: data.from_nickname || data.from, // Use nickname from server
        to: data.to,
        message: data.message,
        timestamp: data.timestamp
    };
    
    gameState.chatHistory.push(msg);
    if (gameState.chatHistory.length > 100) {
        gameState.chatHistory.shift();
    }
    saveToLocalStorage();
    
    displayChatMessage(msg);
    
    // NEW: Show chat bubble above the player who sent the message
    const senderNickname = msg.from_nickname || gameState.players[msg.from]?.nickname || msg.from;
    showCharacterMessage(senderNickname, msg.message);
}

// Display chat message
function displayChatMessage(msg) {
    const chatHistory = document.getElementById('chat-history');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    // Use nickname instead of user_id
    const sender = msg.from_nickname || gameState.players[msg.from]?.nickname || msg.from;
    
    messageDiv.innerHTML = `
        <div class="sender">${escapeHtml(sender)}</div>
        <div class="message">${escapeHtml(msg.message)}</div>
        <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
    `;
    
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Add chat message
function addChatMessage(sender, message) {
    const chatHistory = document.getElementById('chat-history');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    messageDiv.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="message">${escapeHtml(message)}</div>
        <div class="timestamp">${new Date().toLocaleTimeString()}</div>
    `;
    
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update status bars
function updateStatusBars() {
    const energyBar = document.getElementById('energy-bar');
    const energyValue = document.getElementById('energy-value');
    const happinessBar = document.getElementById('happiness-bar');
    const happinessValue = document.getElementById('happiness-value');
    const healthBar = document.getElementById('health-bar');
    const healthValue = document.getElementById('health-value');
    
    if (energyBar) energyBar.style.width = `${gameState.energy}%`;
    if (energyValue) energyValue.textContent = Math.round(gameState.energy);
    if (happinessBar) happinessBar.style.width = `${gameState.happiness}%`;
    if (happinessValue) happinessValue.textContent = Math.round(gameState.happiness);
    if (healthBar) healthBar.style.width = `${gameState.health}%`;
    if (healthValue) healthValue.textContent = Math.round(gameState.health);
}

// Restore interaction history
function restoreInteractionHistory() {
    const interactionArea = document.getElementById('interaction-area');
    interactionArea.innerHTML = '';
    
    gameState.interactionHistory.forEach(interaction => {
        addInteractionToHistory(interaction);
    });
}

// Add interaction to history
function addInteractionToHistory(data) {
    const interactionArea = document.getElementById('interaction-area');
    const interactionDiv = document.createElement('div');
    interactionDiv.className = 'interaction-item';
    
    if (data.type === 'chat') {
        interactionDiv.innerHTML = `
            <h4>${data.item_name || 'Conversation'}</h4>
            <p class="pixel-text">${escapeHtml(data.data.message || 'Hello!')}</p>
            <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
        `;
    } else if (data.type === 'scene_change') {
        interactionDiv.innerHTML = `
            <h4>Travel</h4>
            <p class="pixel-text">Moving to ${data.data.target_scene}...</p>
            <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
        `;
    } else {
        interactionDiv.innerHTML = `
            <h4>Interaction</h4>
            <p class="pixel-text">Interacted with item</p>
            <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
        `;
    }
    
    interactionArea.appendChild(interactionDiv);
    interactionArea.scrollTop = interactionArea.scrollHeight;
}

// Check interaction
function checkInteraction() {
    if (!gameState.currentScene || !gameState.currentScene.items) return;
    
    const interactionDistance = gameState.gameConfig?.interaction_distance || 2;
    
    for (const item of gameState.currentScene.items) {
        const dx = Math.abs(item.x - gameState.position.x);
        const dy = Math.abs(item.y - gameState.position.y);
        
        if (dx <= interactionDistance && dy <= interactionDistance) {
            if (socket) {
                socket.emit('interact_item', {
                    user_id: gameState.userId,
                    item: item,
                    scene: gameState.position.scene
                });
            }
            break;
        }
    }
}

// Display interaction
function displayInteraction(data) {
    // Add to interaction history
    const interactionData = {
        ...data,
        timestamp: new Date().toISOString()
    };
    
    gameState.interactionHistory.push(interactionData);
    if (gameState.interactionHistory.length > 50) {
        gameState.interactionHistory.shift();
    }
    saveToLocalStorage();
    
    // Display in history panel
    addInteractionToHistory(interactionData);
    
    // Display message bubble on character/item
    if (data.type === 'chat' && data.item_name) {
        const message = data.data.message || 'Hello!';
        showCharacterMessage(data.item_name, message);
    }
    
    // Change scene if needed
    if (data.type === 'scene_change') {
        setTimeout(() => {
            gameState.position.scene = data.data.target_scene;
            gameState.position.x = data.data.target_x || 5;
            gameState.position.y = data.data.target_y || 5;
            loadScene(gameState.position.scene);
            saveToLocalStorage();
        }, 1000);
    }
}

// Show character message bubble
function showCharacterMessage(characterName, message) {
    // Store message with timestamp
    gameState.characterMessages[characterName] = {
        message: message,
        timestamp: Date.now()
    };
    
    // Auto-clear after 5 seconds
    setTimeout(() => {
        if (gameState.characterMessages[characterName] && 
            Date.now() - gameState.characterMessages[characterName].timestamp >= 5000) {
            delete gameState.characterMessages[characterName];
        }
    }, 5000);
}

// Toggle bag
function toggleBag() {
    const bagOverlay = document.getElementById('bag-overlay');
    if (bagOverlay.classList.contains('hidden')) {
        showBag();
    } else {
        hideBag();
    }
}

// Show bag
function showBag() {
    const bagOverlay = document.getElementById('bag-overlay');
    const bagItems = document.getElementById('bag-items');
    
    bagItems.innerHTML = '';
    
    const bagSize = gameState.gameConfig?.bag_size || 10;
    
    for (let i = 0; i < bagSize; i++) {
        const slot = document.createElement('div');
        slot.className = 'bag-slot';
        
        if (i < gameState.bag.length) {
            const item = gameState.bag[i];
            if (item.image) {
                const img = document.createElement('img');
                img.src = `/static/assets/items/${item.image}`;
                img.alt = item.name;
                slot.appendChild(img);
            }
        } else {
            slot.classList.add('empty');
        }
        
        bagItems.appendChild(slot);
    }
    
    bagOverlay.classList.remove('hidden');
    
    const closeBtn = document.getElementById('close-bag-btn');
    if (closeBtn) {
        closeBtn.onclick = hideBag;
    }
}

// Hide bag
function hideBag() {
    const bagOverlay = document.getElementById('bag-overlay');
    bagOverlay.classList.add('hidden');
}

// Game loop
function startGameLoop() {
    function loop(timestamp) {
        handleMovement();
        render(timestamp);
        gameLoopId = requestAnimationFrame(loop);
    }
    
    gameLoopId = requestAnimationFrame(loop);
}

// Handle movement
function handleMovement() {
    // Don't move if chat is focused
    if (gameState.isChatFocused) {
        return;
    }
    
    let dx = 0;
    let dy = 0;
    let direction = null;
    
    if (keys['arrowup'] || keys['w']) {
        dy = -1;
        direction = 'up';
    }
    if (keys['arrowdown'] || keys['s']) {
        dy = 1;
        direction = 'down';
    }
    if (keys['arrowleft'] || keys['a']) {
        dx = -1;
        direction = 'left';
    }
    if (keys['arrowright'] || keys['d']) {
        dx = 1;
        direction = 'right';
    }
    
    if (dx !== 0 || dy !== 0) {
        const newX = gameState.position.x + dx * 0.1;
        const newY = gameState.position.y + dy * 0.1;
        
        // Check bounds and obstacles
        if (gameState.currentScene) {
            let canMoveX = newX >= 0 && newX < gameState.currentScene.width;
            let canMoveY = newY >= 0 && newY < gameState.currentScene.height;
            
            // Check collision with obstacles
            if (canMoveX || canMoveY) {
                const collision = checkCollisionWithObstacles(newX, newY);
                if (collision) {
                    canMoveX = false;
                    canMoveY = false;
                }
            }
            
            if (canMoveX) {
                gameState.position.x = newX;
            }
            if (canMoveY) {
                gameState.position.y = newY;
            }
        }
        
        // Update animation frame
        const now = Date.now();
        if (now - lastFrameTime > FRAME_DURATION) {
            animationFrame = (animationFrame + 1) % 3;
            lastFrameTime = now;
        }
        
        // Send to server
        if (socket && direction) {
            socket.emit('player_move', {
                user_id: gameState.userId,
                position: gameState.position,
                direction: direction,
                animation_frame: animationFrame
            });
        }
        
        // Decrease energy slowly
        gameState.energy = Math.max(0, gameState.energy - 0.01);
        updateStatusBars();
        saveToLocalStorage();
    }
}

function checkCollisionWithObstacles(x, y) {
    if (!gameState.currentScene || !gameState.currentScene.items) {
        return false;
    }
    
    const tileSize = gameState.gameConfig?.tile_size || 64;
    const playerRadius = 0.3; // Player collision radius in tiles
    
    // Check each item for obstacle property
    for (const item of gameState.currentScene.items) {
        if (item.obstacle) {
            const itemSize = item.size || 1;
            
            // Get actual image size if available
            let actualItemSize = itemSize;
            if (item.image) {
                const itemImg = imageCache[`/static/assets/items/${item.image}`];
                if (itemImg && itemImg.complete) {
                    // Calculate actual size based on image dimensions
                    actualItemSize = (itemImg.width / tileSize) * itemSize * 0.7; // 70% of visual size for collision
                }
            }
            
            // Calculate distance from player center to item center
            const dx = Math.abs(x - item.x);
            const dy = Math.abs(y - item.y);
            
            // Collision check with actual sizes
            const collisionThreshold = (actualItemSize / 2) + playerRadius;
            
            if (dx < collisionThreshold && dy < collisionThreshold) {
                return true;
            }
        }
    }
    
    return false;
}

// Render
function render(timestamp) {
    if (!ctx || !gameState.currentScene) return;
    
    const tileSize = gameState.gameConfig?.tile_size || 64;
    const viewWidth = gameState.gameConfig?.view_width || 15;
    const viewHeight = gameState.gameConfig?.view_height || 11;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate camera offset (player at center)
    const cameraX = gameState.position.x - viewWidth / 2;
    const cameraY = gameState.position.y - viewHeight / 2;
    
    // Render floor
    const floorImg = imageCache[`/static/assets/scenes/${gameState.currentScene.floor_texture}`];
    if (floorImg) {
        for (let y = 0; y < viewHeight; y++) {
            for (let x = 0; x < viewWidth; x++) {
                const worldX = Math.floor(cameraX + x);
                const worldY = Math.floor(cameraY + y);
                
                if (worldX >= 0 && worldX < gameState.currentScene.width &&
                    worldY >= 0 && worldY < gameState.currentScene.height) {
                    ctx.drawImage(floorImg, x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }
    } else {
        // Fallback: draw grid
        ctx.fillStyle = '#2a4a2a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#1a3a1a';
        for (let y = 0; y <= viewHeight; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * tileSize);
            ctx.lineTo(canvas.width, y * tileSize);
            ctx.stroke();
        }
        for (let x = 0; x <= viewWidth; x++) {
            ctx.beginPath();
            ctx.moveTo(x * tileSize, 0);
            ctx.lineTo(x * tileSize, canvas.height);
            ctx.stroke();
        }
    }
    
    // Render items
    if (gameState.currentScene.items) {
        for (const item of gameState.currentScene.items) {
            const screenX = (item.x - cameraX) * tileSize;
            const screenY = (item.y - cameraY) * tileSize;
            
            if (screenX > -tileSize && screenX < canvas.width &&
                screenY > -tileSize && screenY < canvas.height) {
                const itemImg = imageCache[`/static/assets/items/${item.image}`];
                if (itemImg) {
                    const size = (item.size || 1) * tileSize;
                    ctx.drawImage(itemImg, screenX, screenY, size, size);
                } else {
                    // Fallback: draw colored square
                    ctx.fillStyle = '#8B4513';
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);
                    ctx.strokeStyle = '#654321';
                    ctx.strokeRect(screenX, screenY, tileSize, tileSize);
                }
                
                // Draw message bubble if exists
                if (gameState.characterMessages[item.name]) {
                    renderMessageBubble(
                        screenX + tileSize / 2,
                        screenY - 10,
                        gameState.characterMessages[item.name].message
                    );
                }
            }
        }
    }
    
    // Render other players
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (player.position.scene === gameState.position.scene && playerId !== gameState.userId) {
            renderCharacter(player, cameraX, cameraY, tileSize);
        }
    }
    
    // Render AI players
    for (const aiId in gameState.aiPlayers) {
        const aiPlayer = gameState.aiPlayers[aiId];
        if (aiPlayer.position.scene === gameState.position.scene) {
            renderCharacter(aiPlayer, cameraX, cameraY, tileSize);
        }
    }
    
    // Render AI characters
    for (const charId in gameState.aiCharacters) {
        const aiChar = gameState.aiCharacters[charId];
        if (aiChar.position.scene === gameState.position.scene) {
            renderCharacter(aiChar, cameraX, cameraY, tileSize);
        }
    }
    
    // Render player (always at center)
    const playerScreenX = (viewWidth / 2) * tileSize;
    const playerScreenY = (viewHeight / 2) * tileSize;
    renderPlayerCharacter(gameState, playerScreenX, playerScreenY, tileSize);
}

// Render message bubble
function renderMessageBubble(x, y, message) {
    const maxWidth = 200;
    const padding = 10;
    const lineHeight = 16;
    const maxLines = 3;
    
    // Set font for measuring
    ctx.font = '12px "Courier New"';
    
    // Word wrap
    const words = message.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth - padding * 2 && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    
    // Limit to max lines
    const displayLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
        displayLines[maxLines - 1] += '...';
    }
    
    // Calculate bubble dimensions
    const bubbleWidth = Math.min(maxWidth, Math.max(...displayLines.map(l => ctx.measureText(l).width)) + padding * 2);
    const bubbleHeight = displayLines.length * lineHeight + padding * 2;
    
    // Draw bubble background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    
    const bubbleX = x - bubbleWidth / 2;
    const bubbleY = y - bubbleHeight - 10;
    
    ctx.fillRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
    ctx.strokeRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
    
    // Draw pointer
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, bubbleY + bubbleHeight);
    ctx.lineTo(x + 8, bubbleY + bubbleHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw text
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    displayLines.forEach((line, i) => {
        ctx.fillText(line, bubbleX + padding, bubbleY + padding + i * lineHeight);
    });
}

// Render character
// Render character
function renderCharacter(character, cameraX, cameraY, tileSize) {
    const screenX = (character.position.x - cameraX) * tileSize;
    const screenY = (character.position.y - cameraY) * tileSize;
    
    if (screenX > -tileSize && screenX < canvas.width &&
        screenY > -tileSize && screenY < canvas.height) {
        const spritePath = `/static/assets/characters/${character.sprite}`;
        const spriteImg = imageCache[spritePath];
        
        if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
            // Sprite sheet is 96x128 (3 cols x 4 rows, each frame is 32x32)
            const frameWidth = 32;
            const frameHeight = 32;
            
            // Map direction to sprite row
            let row = 0; // default down
            
            if (character.direction === 'down' || !character.direction) {
                row = 0; // Row 0 for down
            } else if (character.direction === 'left') {
                row = 1; // Row 1 for left
            } else if (character.direction === 'right') {
                row = 2; // Row 2 for right
            } else if (character.direction === 'up') {
                row = 3; // Row 3 for up
            }
            
            const col = (character.animation_frame || 0) % 3;
            
            // Draw the sprite
            ctx.drawImage(
                spriteImg,
                col * frameWidth,      // Source X
                row * frameHeight,     // Source Y
                frameWidth,            // Source width (32px)
                frameHeight,           // Source height (32px)
                screenX,               // Destination X
                screenY,               // Destination Y
                tileSize,              // Destination width (64px - scaled up)
                tileSize               // Destination height (64px - scaled up)
            );
            
            // Draw name
            ctx.fillStyle = '#00ff88';
            ctx.font = '12px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(character.nickname || character.name, screenX + tileSize / 2, screenY - 5);
            
            // Draw message bubble if exists
            const charName = character.nickname || character.name;
            if (gameState.characterMessages[charName]) {
                renderMessageBubble(
                    screenX + tileSize / 2,
                    screenY - 10,
                    gameState.characterMessages[charName].message
                );
            }
        } else {
            // Fallback: draw colored circle
            if (!spriteImg && Math.random() < 0.01) {
                console.warn('⚠️ Character sprite not loaded:', character.nickname || character.name, spritePath);
                preloadCharacterSprite(character.sprite);
            }
            
            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.arc(screenX + tileSize / 2, screenY + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw name (even for fallback)
            ctx.fillStyle = '#00ff88';
            ctx.font = '12px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(character.nickname || character.name, screenX + tileSize / 2, screenY - 5);
            
            // Draw message bubble if exists (even for fallback)
            const charName = character.nickname || character.name;
            if (gameState.characterMessages[charName]) {
                renderMessageBubble(
                    screenX + tileSize / 2,
                    screenY - 10,
                    gameState.characterMessages[charName].message
                );
            }
        }
    }
}

// Render player character
// Render player character
function renderPlayerCharacter(player, screenX, screenY, tileSize) {
    const spritePath = `/static/assets/characters/${player.sprite}`;
    const spriteImg = imageCache[spritePath];
    
    // Only log once every 60 frames to avoid console spam
    if (animationFrame === 0) {
        console.log('Rendering player - Sprite in cache:', !!spriteImg);
        if (spriteImg) {
            console.log('  - Complete:', spriteImg.complete, 'Size:', spriteImg.naturalWidth, 'x', spriteImg.naturalHeight);
        }
    }
    
    // Check if sprite is loaded AND valid
    if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        // Sprite sheet is 96x128 (3 cols x 4 rows, each frame is 32x32)
        const frameWidth = 32;
        const frameHeight = 32;
        
        // Map direction to sprite row
        let row = 0; // default down
        const direction = getPlayerDirection();
        
        if (direction === 'down') {
            row = 0; // Row 0 for down
        } else if (direction === 'left') {
            row = 1; // Row 1 for left
        } else if (direction === 'right') {
            row = 2; // Row 2 for right
        } else if (direction === 'up') {
            row = 3; // Row 3 for up
        }
        
        const col = animationFrame % 3;
        
        // Draw the sprite
        ctx.drawImage(
            spriteImg,
            col * frameWidth,      // Source X
            row * frameHeight,     // Source Y
            frameWidth,            // Source width (32px)
            frameHeight,           // Source height (32px)
            screenX,               // Destination X
            screenY,               // Destination Y
            tileSize,              // Destination width (64px - scaled up)
            tileSize               // Destination height (64px - scaled up)
        );
        
        // Draw name
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 12px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText(player.nickname, screenX + tileSize / 2, screenY - 5);
        
        // NEW: Draw message bubble if exists for the player
        if (gameState.characterMessages[player.nickname]) {
            renderMessageBubble(
                screenX + tileSize / 2,
                screenY - 10,
                gameState.characterMessages[player.nickname].message
            );
        }
    } else {
        // Fallback: draw colored circle
        if (animationFrame === 0) {
            console.warn('⚠️ Using fallback circle - sprite not loaded');
            console.warn('Expected sprite path:', spritePath);
        }
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(screenX + tileSize / 2, screenY + tileSize / 2, tileSize / 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw name
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 12px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText(player.nickname, screenX + tileSize / 2, screenY - 5);
        
        // NEW: Draw message bubble if exists (even for fallback)
        if (gameState.characterMessages[player.nickname]) {
            renderMessageBubble(
                screenX + tileSize / 2,
                screenY - 10,
                gameState.characterMessages[player.nickname].message
            );
        }
    }
}

// Get player direction
function getPlayerDirection() {
    if (keys['arrowup'] || keys['w']) return 'up';
    if (keys['arrowdown'] || keys['s']) return 'down';
    if (keys['arrowleft'] || keys['a']) return 'left';
    if (keys['arrowright'] || keys['d']) return 'right';
    return 'down';
}