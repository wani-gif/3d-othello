// main.js

import * as THREE from "./build/three.module.js"; // 相対パスに戻す
import { OrbitControls } from "./jsm/controls/OrbitControls.js"; // 相対パスに戻す

// --- グローバル変数と初期設定 ---
let scene, camera, renderer, controls;
let gridSize = 8;
let cellSize = 1;
let offset;
let cells = [];
let board = [];
let pieceGeometry, blackMaterial, whiteMaterial;
let pieces = [];
let highlightMaterial, highlightGeometry;
let highlightMeshes = [];
let currentPlayer = -1; // -1:黒, 1:白
let currentPossibleMoves = [];
let isOrbiting = false;

let isCpuTurn = false;
const CPU_PLAYER = 1;
const PLAYER_PLAYER = -1;
let currentSelectedSize = 8;
let cpuDifficulty = 1;

const directions = [];
for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            directions.push({ dx, dy, dz });
        }
    }
}

// --- ゲーム初期化関数 ---
function initGame(selectedGridSize) {
    currentSelectedSize = selectedGridSize;
    gridSize = selectedGridSize;
    cellSize = 1;
    offset = (gridSize - 1) / 2 * cellSize;

    if (scene) {
        // シーンからすべてのオブジェクトを削除 (メモリリーク防止)
        while(scene.children.length > 0){
            scene.remove(scene.children[0]);
        }
        // レンダラーのDOM要素を削除 (canvas要素)
        if (renderer && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(offset + 2, offset + 5, offset + 7);
    camera.lookAt(new THREE.Vector3(offset, offset, offset));

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(offset + 2, offset + 5, offset + 4).normalize();
    scene.add(directionalLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.addEventListener('start', () => { isOrbiting = true; });
    controls.addEventListener('end', () => { isOrbiting = false; });

    board = [];
    for (let x = 0; x < gridSize; x++) {
        board[x] = [];
        for (let y = 0; y < gridSize; y++) {
            board[x][y] = [];
            for (let z = 0; z < gridSize; z++) {
                board[x][y][z] = 0;
            }
        }
    }

    cells = [];
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            for (let z = 0; z < gridSize; z++) {
                const cellGeometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
                const cellMaterial = new THREE.MeshBasicMaterial({
                    transparent: true,
                    opacity: 0
                });
                const cell = new THREE.Mesh(cellGeometry, cellMaterial);
                cell.position.set(
                    x * cellSize - offset,
                    y * cellSize - offset,
                    z * cellSize - offset
                );
                cell.userData.boardX = x;
                cell.userData.boardY = y;
                cell.userData.boardZ = z;
                cell.raycast = function() {};
                scene.add(cell);
                cells.push(cell);
            }
        }
    }

    const outerBoxSize = gridSize * cellSize;
    const outerBoxHalfSize = outerBoxSize / 2;
    const points = [
        new THREE.Vector3(-outerBoxHalfSize, -outerBoxHalfSize, -outerBoxHalfSize),
        new THREE.Vector3( outerBoxHalfSize, -outerBoxHalfSize, -outerBoxHalfSize),
        new THREE.Vector3( outerBoxHalfSize,  outerBoxHalfSize, -outerBoxHalfSize),
        new THREE.Vector3(-outerBoxHalfSize,  outerBoxHalfSize, -outerBoxHalfSize),
        new THREE.Vector3(-outerBoxHalfSize, -outerBoxHalfSize,  outerBoxHalfSize),
        new THREE.Vector3( outerBoxHalfSize, -outerBoxHalfSize,  outerBoxHalfSize),
        new THREE.Vector3( outerBoxHalfSize,  outerBoxHalfSize,  outerBoxHalfSize),
        new THREE.Vector3(-outerBoxHalfSize,  outerBoxHalfSize,  outerBoxHalfSize)
    ];
    const indices = [
        0, 1, 1, 2, 2, 3, 3, 0,
        4, 5, 5, 6, 6, 7, 7, 4,
        0, 4,
        1, 5,
        2, 6,
        3, 7
    ];
    const outerBoxGeometry = new THREE.BufferGeometry().setFromPoints(points);
    outerBoxGeometry.setIndex(indices);
    const outerBoxMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff00, // 緑色
        transparent: true,
        opacity: 0.5
    });
    const outerBox = new THREE.LineSegments(outerBoxGeometry, outerBoxMaterial);
    scene.add(outerBox);

    const outerBoxMaterialThicker = new THREE.LineBasicMaterial({
        color: 0x00ff00, // 緑色
        transparent: true,
        opacity: 0.5
    });
    const pointsThicker = points.map(v => v.clone().multiplyScalar(1.01)); // 少し外側に拡大
    const outerBoxGeometryThicker = new THREE.BufferGeometry().setFromPoints(pointsThicker);
    outerBoxGeometryThicker.setIndex(indices);
    const outerBoxThicker = new THREE.LineSegments(outerBoxGeometryThicker, outerBoxMaterialThicker);
    scene.add(outerBoxThicker);


    pieceGeometry = new THREE.SphereGeometry(0.4, 32, 32);
    blackMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
    whiteMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

    pieces = [];

    const initialPiecesData = [
        { x: (gridSize/2)-1, y: (gridSize/2)-1, z: (gridSize/2)-1, player: -1 },
        { x: (gridSize/2), y: (gridSize/2), z: (gridSize/2)-1, player: -1 },
        { x: (gridSize/2)-1, y: (gridSize/2), z: (gridSize/2), player: -1 },
        { x: (gridSize/2), y: (gridSize/2)-1, z: (gridSize/2), player: -1 },
        { x: (gridSize/2)-1, y: (gridSize/2), z: (gridSize/2)-1, player: 1 },
        { x: (gridSize/2), y: (gridSize/2)-1, z: (gridSize/2)-1, player: 1 },
        { x: (gridSize/2)-1, y: (gridSize/2)-1, z: (gridSize/2), player: 1 },
        { x: (gridSize/2), y: (gridSize/2), z: (gridSize/2), player: 1 }
    ];

    initialPiecesData.forEach(data => {
        placePiece(data.x, data.y, data.z, data.player);
    });

    highlightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00, // 黄色
        transparent: true,
        opacity: 0.4,
        depthTest: false, // 常に手前に透けて見える
        depthWrite: false
    });
    highlightGeometry = new THREE.BoxGeometry(cellSize * 0.5, cellSize * 0.5, cellSize * 0.5);

    highlightMeshes = [];

    currentPlayer = -1;
    isCpuTurn = false;

    updatePossibleMoves();
    animate();
}

// --- ゲームロジック関連関数 ---
function placePiece(x, y, z, player) {
    if (board[x][y][z] !== 0) {
        console.warn(`Attempted to place piece on occupied cell at (${x}, ${y}, ${z})`);
        return;
    }

    const materialToUse = (player === -1) ? blackMaterial : whiteMaterial;
    const piece = new THREE.Mesh(pieceGeometry, materialToUse);
    piece.position.set(
        x * cellSize - offset,
        y * cellSize - offset,
        z * cellSize - offset
    );
    scene.add(piece);
    board[x][y][z] = player;

    piece.userData.boardX = x;
    piece.userData.boardY = y;
    piece.userData.boardZ = z;
    piece.userData.player = player;

    piece.raycast = function() {};

    pieces.push(piece);
}

function getFlippablePieces(currentBoard, x, y, z, player) {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize || z < 0 || z >= gridSize || currentBoard[x][y][z] !== 0) {
        return [];
    }

    const flippableInAllDirections = [];

    for (const dir of directions) {
        const potentialFlippableInThisDirection = [];
        let currentX = x + dir.dx;
        let currentY = y + dir.dy;
        let currentZ = z + dir.dz;

        if (currentX < 0 || currentX >= gridSize ||
            currentY < 0 || currentY >= gridSize ||
            currentZ < 0 || currentZ >= gridSize) {
            continue;
        }

        let firstNeighbor = currentBoard[currentX][currentY][currentZ];

        if (firstNeighbor === 0 || firstNeighbor === player) {
            continue;
        }

        potentialFlippableInThisDirection.push({ x: currentX, y: currentY, z: currentZ });

        currentX += dir.dx;
        currentY += dir.dy;
        currentZ += dir.dz;

        while (
            currentX >= 0 && currentX < gridSize &&
            currentY >= 0 && currentY < gridSize &&
            currentZ >= 0 && currentZ < gridSize
        ) {
            const cellValue = currentBoard[currentX][currentY][currentZ];

            if (cellValue === 0) {
                break;
            } else if (cellValue === player) {
                flippableInAllDirections.push(...potentialFlippableInThisDirection);
                break;
            } else {
                potentialFlippableInThisDirection.push({ x: currentX, y: currentY, z: currentZ });
            }

            currentX += dir.dx;
            currentY += dir.dy;
            currentZ += dir.dz;
        }
    }
    return flippableInAllDirections;
}

function updatePossibleMoves() {
    highlightMeshes.forEach(mesh => scene.remove(mesh));
    highlightMeshes.length = 0;
    currentPossibleMoves.length = 0;

    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            for (let z = 0; z < gridSize; z++) {
                const flippable = getFlippablePieces(board, x, y, z, currentPlayer);
                if (flippable.length > 0) {
                    currentPossibleMoves.push({ x, y, z });
                }
            }
        }
    }

    currentPossibleMoves.forEach(move => {
        const highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
        highlightMesh.position.set(
            move.x * cellSize - offset,
            move.y * cellSize - offset,
            move.z * cellSize - offset
        );
        highlightMesh.userData.boardX = move.x;
        highlightMesh.userData.boardY = move.y;
        highlightMesh.userData.boardZ = move.z;
        highlightMesh.userData.isHighlight = true;
        highlightMesh.renderOrder = 1;
        highlightMesh.material.depthTest = false; // 常に手前に描画されるように深度テストを無効にする
        scene.add(highlightMesh);
        highlightMeshes.push(highlightMesh);
    });

    if (currentPossibleMoves.length === 0) {
        console.log(`Player ${currentPlayer === -1 ? '黒' : '白'} has no moves. Attempting to pass turn.`);
        showPassMessage(); // パスメッセージ表示

        currentPlayer *= -1; // プレイヤーを交代
        updateUI(); // UIも一旦更新

        let opponentHasMoves = false;
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                for (let z = 0; z < gridSize; z++) {
                    const flippableForOpponent = getFlippablePieces(board, x, y, z, currentPlayer);
                    if (flippableForOpponent.length > 0) {
                        opponentHasMoves = true;
                        break;
                    }
                }
                if (opponentHasMoves) break;
            }
            if (opponentHasMoves) break;
        }

        if (!opponentHasMoves) {
            console.log("Both players passed. Game Over!");
            endGame(); // ゲーム終了処理を呼び出し
            isCpuTurn = false; // CPUのターンフラグもリセット
        } else {
            console.log(`Player ${currentPlayer === -1 ? '黒' : '白'} has moves. Game continues.`);
            
            if (currentPlayer === CPU_PLAYER) {
                isCpuTurn = true;
                showCpuThinkingMessage(); // CPU思考中メッセージ表示
                setTimeout(cpuMove, 1000);
            } else {
                isCpuTurn = false;
            }

            updatePossibleMoves();
        }
    } else {
        if (currentPlayer === CPU_PLAYER) {
            isCpuTurn = true;
            showCpuThinkingMessage(); // CPU思考中メッセージ表示
            setTimeout(cpuMove, 1000);
        } else {
            isCpuTurn = false;
        }
    }

    updateUI();
    console.log(`Possible moves for ${currentPlayer === -1 ? '黒' : '白'}:`, currentPossibleMoves.length, currentPossibleMoves);
}

function cpuMove() {
    hideCpuThinkingMessage(); // CPU思考中メッセージを非表示

    if (currentPossibleMoves.length > 0) {
        let selectedMove;

        if (cpuDifficulty === 1) { // レベル1: ランダム
            const randomIndex = Math.floor(Math.random() * currentPossibleMoves.length);
            selectedMove = currentPossibleMoves[randomIndex];
        } else if (cpuDifficulty === 2) { // レベル2: 最大反転
            let maxFlips = -1;
            let bestMoves = [];

            currentPossibleMoves.forEach(move => {
                const tempBoard = JSON.parse(JSON.stringify(board));
                tempBoard[move.x][move.y][move.z] = CPU_PLAYER;
                const flippable = getFlippablePieces(tempBoard, move.x, move.y, move.z, CPU_PLAYER);
                
                if (flippable.length > maxFlips) {
                    maxFlips = flippable.length;
                    bestMoves = [move];
                } else if (flippable.length === maxFlips) {
                    bestMoves.push(move);
                }
            });

            const randomIndex = Math.floor(Math.random() * bestMoves.length);
            selectedMove = bestMoves[randomIndex];
        }

        placePiece(selectedMove.x, selectedMove.y, selectedMove.z, CPU_PLAYER);
        console.log(`CPU placed piece at: (${selectedMove.x}, ${selectedMove.y}, ${selectedMove.z})`);

        const flippablePieces = getFlippablePieces(board, selectedMove.x, selectedMove.y, selectedMove.z, CPU_PLAYER);
        let flipPromises = flippablePieces.map(coord => flipPieceVisual(coord.x, coord.y, coord.z, CPU_PLAYER));

        Promise.all(flipPromises).then(() => {
            currentPlayer *= -1;
            console.log(`Next player: ${currentPlayer === -1 ? '黒' : '白'}`);
            updatePossibleMoves();
            isCpuTurn = false;
        });
    } else {
        console.log("CPU has no moves. Passing.");
        isCpuTurn = false;
        currentPlayer *= -1;
        updatePossibleMoves();
    }
}


const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const handleGameClick = (event) => {
    if (isOrbiting || isCpuTurn) {
        console.log("Ignoring click: Orbiting or CPU's turn.");
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(highlightMeshes);

    if (intersects.length > 0) {
        const clickedHighlight = intersects.at(0).object;

        const x = clickedHighlight.userData.boardX;
        const y = clickedHighlight.userData.boardY;
        const z = clickedHighlight.userData.boardZ;

        const flippablePieces = getFlippablePieces(board, x, y, z, currentPlayer);

        if (flippablePieces.length > 0) {
            placePiece(x, y, z, currentPlayer);
            console.log(`Placed ${currentPlayer === -1 ? '黒' : '白'} piece at: (${x}, ${y}, ${z})`);

            let flipPromises = flippablePieces.map(coord => flipPieceVisual(coord.x, coord.y, coord.z, currentPlayer));

            Promise.all(flipPromises).then(() => {
                currentPlayer *= -1;
                console.log(`Next player: ${currentPlayer === -1 ? '黒' : '白'}`);
                updatePossibleMoves();
            });
        } else {
            console.log(`Error: Clicked highlighted cell (${x}, ${y}, ${z}), but no pieces to flip. (Logic error)`);
        }
    } else {
        console.log("No highlighted cell clicked. Please click on a highlighted cell.");
    }
};

// 駒をひっくり返すアニメーション関数
function flipPieceVisual(x, y, z, newPlayer) {
    return new Promise(resolve => {
        const pieceToFlip = pieces.find(piece =>
            piece.userData.boardX === x &&
            piece.userData.boardY === y &&
            piece.userData.boardZ === z
        );

        if (!pieceToFlip) {
            resolve();
            return;
        }

        const originalMaterial = pieceToFlip.material;
        const targetMaterial = (newPlayer === -1) ? blackMaterial : whiteMaterial;
        const startTime = performance.now();

        flippingPieces.push({
            piece: pieceToFlip,
            startTime: startTime,
            originalMaterial: originalMaterial,
            targetMaterial: targetMaterial,
            newPlayer: newPlayer,
            resolve: resolve
        });

        // 盤面データを即座に更新 (アニメーション中もロジックは最新の状態を保持)
        board[x][y][z] = newPlayer;
        pieceToFlip.userData.player = newPlayer;
    });
}

// アニメーション処理を animate ループ内で実行
let lastFrameTime = 0;
function updateFlippingPieces(currentTime) {
    const stillFlipping = [];
    flippingPieces.forEach(item => {
        const elapsed = performance.now() - item.startTime;
        const progress = Math.min(elapsed / FLIP_DURATION, 1);

        // 駒がくるっと回転するアニメーション
        // progressが0.5を超えたあたりで色が変わるように
        if (progress < 0.5) {
            // 前半: 回転のみ (色変更なし)
            item.piece.rotation.y = Math.PI * progress * 2; // 0 -> PI (180度)
            item.piece.material = item.originalMaterial; // 念のため元の色を維持
        } else {
            // 後半: 回転と色変更
            item.piece.rotation.y = Math.PI * progress * 2; // PI -> 2PI (180度 -> 360度)
            item.piece.material = item.targetMaterial; // 目標の色に設定
        }

        if (progress < 1) {
            stillFlipping.push(item);
        } else {
            // アニメーション完了
            item.piece.rotation.y = 0; // 回転をリセット
            item.resolve(); // Promiseを解決
        }
    });
    flippingPieces = stillFlipping;
}


function updateUI() {
    const turnColorSpan = document.getElementById('turn-color');
    const blackScoreSpan = document.getElementById('black-score');
    const whiteScoreSpan = document.getElementById('white-score');

    turnColorSpan.textContent = currentPlayer === -1 ? '黒' : '白';
    turnColorSpan.style.color = currentPlayer === -1 ? 'black' : 'white';
    turnColorSpan.style.textShadow = currentPlayer === -1 ? '1px 1px 2px white' : '1px 1px 2px black';

    let blackCount = 0;
    let whiteCount = 0;
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            for (let z = 0; z < gridSize; z++) {
                if (board[x][y][z] === -1) {
                    blackCount++;
                } else if (board[x][y][z] === 1) {
                    whiteCount++;
                }
            }
        }
    }

    blackScoreSpan.textContent = blackCount;
    whiteScoreSpan.textContent = whiteCount;
}

function animate(currentTime) { // currentTimeを引数として受け取る
    requestAnimationFrame(animate);

    const deltaTime = currentTime - lastFrameTime; // デルタタイム計算
    lastFrameTime = currentTime;

    controls.update();
    updateFlippingPieces(deltaTime); // 駒のアニメーションを更新
    renderer.render(scene, camera);
}

// --- ウィンドウのリサイズイベントリスナー ---
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
    }
});


// --- ゲーム開始画面と初期化のトリガー ---
document.addEventListener('DOMContentLoaded', () => {
    const startScreen = document.getElementById('start-screen');
    const boardSizeSelection = document.getElementById('board-size-selection');
    const difficultySelection = document.getElementById('difficulty-selection');

    const size8x8x8Btn = document.getElementById('size-8x8x8');
    const size6x6x6Btn = document.getElementById('size-6x6x6');
    const size4x4x4Btn = document.getElementById('size-4x4x4');
    const difficultyEasyBtn = document.getElementById('difficulty-easy');
    const difficultyMediumBtn = document.getElementById('difficulty-medium');
    const resetButton = document.getElementById('reset-button');

    passMessageDiv = document.getElementById('pass-message');
    cpuThinkingMessageDiv = document.getElementById('cpu-thinking-message');
    gameOverScreen = document.getElementById('game-over-screen');
    gameOverTitle = document.getElementById('game-over-title');
    gameOverScore = document.getElementById('game-over-score');
    playAgainButton = document.getElementById('play-again-button');


    if (startScreen) {
        startScreen.style.display = 'flex';
    }
    if (boardSizeSelection) {
        boardSizeSelection.style.display = 'block';
    }
    if (difficultySelection) {
        difficultySelection.style.display = 'none';
    }


    if (size8x8x8Btn) {
        size8x8x8Btn.addEventListener('click', () => selectBoardSize(8));
    }
    if (size6x6x6Btn) {
        size6x6x6Btn.addEventListener('click', () => selectBoardSize(6));
    }
    if (size4x4x4Btn) {
        size4x4x4Btn.addEventListener('click', () => selectBoardSize(4));
    }

    if (difficultyEasyBtn) {
        difficultyEasyBtn.addEventListener('click', () => selectDifficultyAndStartGame(1));
    }
    if (difficultyMediumBtn) {
        difficultyMediumBtn.addEventListener('click', () => selectDifficultyAndStartGame(2));
    }

    cpuDifficulty = 1;
    console.log(`Default CPU Difficulty set to: Level ${cpuDifficulty}`);

    if (resetButton) {
        resetButton.addEventListener('click', showStartScreen);
    }
    if (playAgainButton) {
        playAgainButton.addEventListener('click', showStartScreen);
    }
});

// ボードサイズ選択後の処理関数
function selectBoardSize(size) {
    currentSelectedSize = size;
    const boardSizeSelection = document.getElementById('board-size-selection');
    const difficultySelection = document.getElementById('difficulty-selection');
    const startScreenTitle = document.getElementById('start-screen-title');

    if (boardSizeSelection) {
        boardSizeSelection.style.display = 'none'; // ボードサイズ選択を非表示
    }
    if (difficultySelection) {
        difficultySelection.style.display = 'block'; // 難易度選択を表示
    }
    if (startScreenTitle) {
        startScreenTitle.textContent = `3D オセロ (${size}x${size}x${size})`; // タイトルを更新
    }
}

// 難易度選択後のゲーム開始処理関数
function selectDifficultyAndStartGame(difficulty) {
    cpuDifficulty = difficulty;
    const startScreen = document.getElementById('start-screen');

    if (startScreen) {
        startScreen.style.display = 'none'; // 開始画面を非表示
    }
    if (gameOverScreen) {
        gameOverScreen.style.display = 'none';
    }
    initGame(currentSelectedSize);
    window.addEventListener('click', handleGameClick);
}


function showStartScreen() {
    const startScreen = document.getElementById('start-screen');
    const boardSizeSelection = document.getElementById('board-size-selection');
    const difficultySelection = document.getElementById('difficulty-selection');
    const startScreenTitle = document.getElementById('start-screen-title');


    if (startScreen) {
        startScreen.style.display = 'flex';
    }
    if (boardSizeSelection) {
        boardSizeSelection.style.display = 'block';
    }
    if (difficultySelection) {
        difficultySelection.style.display = 'none';
    }
    if (startScreenTitle) {
        startScreenTitle.textContent = `3D オセロ`;
    }

    if (gameOverScreen) {
        gameOverScreen.style.display = 'none';
    }
    if (passMessageDiv) passMessageDiv.style.display = 'none';
    if (cpuThinkingMessageDiv) cpuThinkingMessageDiv.style.display = 'none';


    window.removeEventListener('click', handleGameClick);
    if (scene) {
        while(scene.children.length > 0){
            scene.remove(scene.children[0]);
        }
    }
    if (renderer && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer = null;
    }
    board = [];
    pieces = [];
    highlightMeshes = [];
    flippingPieces = [];
    currentPlayer = -1;
    isCpuTurn = false;
    currentPossibleMoves = [];
    updateUI();
}

// パスメッセージ表示関数
function showPassMessage() {
    if (passMessageDiv) {
        passMessageDiv.style.display = 'block';
        passMessageDiv.style.animation = 'none';
        void passMessageDiv.offsetWidth;
        passMessageDiv.style.animation = 'fadeInOut 2s ease-in-out forwards';
        setTimeout(() => {
            passMessageDiv.style.display = 'none';
        }, 2000);
    }
}

// CPU思考中メッセージ表示関数
function showCpuThinkingMessage() {
    if (cpuThinkingMessageDiv) {
        cpuThinkingMessageDiv.style.display = 'block';
        cpuThinkingMessageDiv.style.animation = 'none';
        void cpuThinkingMessageDiv.offsetWidth;
    }
}

// CPU思考中メッセージ非表示関数
function hideCpuThinkingMessage() {
    if (cpuThinkingMessageDiv) {
        cpuThinkingMessageDiv.style.display = 'none';
    }
}

// ゲーム終了処理関数
function endGame() {
    let blackCount = 0;
    let whiteCount = 0;
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            for (let z = 0; z < gridSize; z++) {
                if (board[x][y][z] === -1) {
                    blackCount++;
                } else if (board[x][y][z] === 1) {
                    whiteCount++;
                }
            }
        }
    }

    let resultText = "";
    if (blackCount > whiteCount) {
        resultText = "黒の勝利！";
    } else if (whiteCount > blackCount) {
        resultText = "白の勝利！";
    } else {
        resultText = "引き分け！";
    }

    if (gameOverTitle) {
        gameOverTitle.textContent = resultText;
    }
    if (gameOverScore) {
        gameOverScore.textContent = `黒: ${blackCount} vs 白: ${whiteCount}`;
    }
    if (gameOverScreen) {
        gameOverScreen.style.display = 'flex';
    }
    window.removeEventListener('click', handleGameClick);
}