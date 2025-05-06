// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun'] // 使用公開的 GUN 節點
});

// 遊戲狀態
const gameState = {
    score: 0,
    isPlaying: false,
    playerName: '',
    tiles: [],
    speed: 2,
    lastTick: 0,
    lives: 3, // 新增生命值
    gameOver: false // 新增遊戲結束狀態
};

// 音符設置
const notes = ['C4', 'D4', 'E4', 'F4'];
const synth = new Tone.Synth().toDestination();

// DOM 元素
const pianoTiles = document.getElementById('piano-tiles');
const startBtn = document.getElementById('start-btn');
const scoreElement = document.getElementById('score');
const playerNameInput = document.getElementById('player-name');
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');

// 遊戲資料節點
const playersRef = gun.get('piano-players');
const tilesRef = gun.get('piano-tiles');

// 初始化玩家
function initPlayer() {
    gameState.playerName = playerNameInput.value || '玩家' + Math.floor(Math.random() * 1000);
    playersRef.get(gameState.playerName).put({
        name: gameState.playerName,
        score: 0,
        lastActive: Date.now()
    });
}

// 更新玩家列表
playersRef.map().on((data, id) => {
    if (data && Date.now() - data.lastActive < 10000) {
        updatePlayerList(data);
    }
});

function updatePlayerList(playerData) {
    const playerItems = Array.from(playerList.children);
    const existingItem = playerItems.find(item => item.dataset.player === playerData.name);
    
    if (!existingItem) {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.dataset.player = playerData.name;
        item.innerHTML = `
            <span>${playerData.name}</span>
            <span>分數: ${playerData.score}</span>
        `;
        playerList.appendChild(item);
    } else {
        existingItem.querySelector('span:last-child').textContent = `分數: ${playerData.score}`;
    }
    
    playerCount.textContent = playerList.children.length;
}

// 創建音樂方塊
function createTile() {
    const lane = Math.floor(Math.random() * 4);
    const tile = {
        id: Date.now(),
        lane,
        y: -150,
        note: notes[lane]
    };
    
    const tileElement = document.createElement('div');
    tileElement.className = 'tile';
    tileElement.style.left = (lane * 100) + 'px';
    tileElement.style.top = tile.y + 'px';
    tileElement.dataset.id = tile.id;
    
    tileElement.addEventListener('click', () => {
        if (tile.y > 300 && tile.y < 450) {
            hitTile(tile, tileElement);
        }
    });
    
    pianoTiles.appendChild(tileElement);
    gameState.tiles.push({ tile, element: tileElement });
    
    // 同步方塊資訊到其他玩家
    tilesRef.get(tile.id).put(tile);
}

// 點擊方塊
function hitTile(tile, element) {
    if (gameState.gameOver) return;
    
    synth.triggerAttackRelease(tile.note, '8n');
    element.classList.add('active');
    gameState.score += 10;
    scoreElement.textContent = gameState.score;
    
    // 更新玩家分數
    playersRef.get(gameState.playerName).get('score').put(gameState.score);
    
    setTimeout(() => {
        element.remove();
        gameState.tiles = gameState.tiles.filter(t => t.tile.id !== tile.id);
    }, 100);
}

// 遊戲主循環
function gameLoop(timestamp) {
    if (!gameState.lastTick) gameState.lastTick = timestamp;
    const delta = timestamp - gameState.lastTick;
    
    if (delta > 16) {  // 約60fps
        gameState.tiles.forEach(({tile, element}) => {
            tile.y += gameState.speed;
            element.style.top = tile.y + 'px';
            
            if (tile.y > 500) {
                element.classList.add('missed');
                // 遊戲結束條件：錯過方塊
                endGame('錯過音樂方塊！');
                return;
            }
        });
        
        gameState.lastTick = timestamp;
    }
    
    if (gameState.isPlaying && !gameState.gameOver) {
        requestAnimationFrame(gameLoop);
    }
}

// 遊戲結束處理
function endGame(reason) {
    gameState.isPlaying = false;
    gameState.gameOver = true;
    startBtn.textContent = '重新開始';
    
    // 清除所有方塊
    gameState.tiles.forEach(({element}) => {
        element.remove();
    });
    gameState.tiles = [];
    
    // 顯示遊戲結束訊息
    const messageDiv = document.createElement('div');
    messageDiv.className = 'game-over-message';
    messageDiv.innerHTML = `
        <h2>遊戲結束</h2>
        <p>原因: ${reason}</p>
        <p>最終分數: ${gameState.score}</p>
    `;
    pianoTiles.appendChild(messageDiv);
    
    // 更新最終分數到 GUN
    playersRef.get(gameState.playerName).put({
        score: gameState.score,
        lastActive: Date.now(),
        status: 'game-over'
    });
}

// 開始遊戲
startBtn.addEventListener('click', () => {
    // 清除之前的遊戲結束訊息
    const oldMessage = pianoTiles.querySelector('.game-over-message');
    if (oldMessage) {
        oldMessage.remove();
    }
    
    if (!gameState.isPlaying) {
        gameState.gameOver = false;
        gameState.score = 0;
        scoreElement.textContent = '0';
        initPlayer();
        gameState.isPlaying = true;
        startBtn.textContent = '遊戲進行中';
        
        // 定期產生新方塊
        const tileInterval = setInterval(() => {
            if (!gameState.isPlaying || gameState.gameOver) {
                clearInterval(tileInterval);
                return;
            }
            createTile();
        }, 1000);
        
        requestAnimationFrame(gameLoop);
    }
});

// 定期更新玩家活動狀態
setInterval(() => {
    if (gameState.isPlaying) {
        playersRef.get(gameState.playerName).get('lastActive').put(Date.now());
    }
}, 5000);