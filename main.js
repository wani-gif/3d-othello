// main.js

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --- グローバル変数と初期設定 ---
let scene, camera, renderer, controls;
let gridSize = 8;
let cellSize; // cellSizeはgridSizeに応じて設定
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
const CPU_PLAYER = 1; // 白
const PLAYER_PLAYER = -1; // 黒
let currentSelectedSize = 8;
let cpuDifficulty = 1;

let flippingPieces = [];
const FLIP_DURATION = 300; // 駒の反転アニメーション時間 (ms)
const FLIP_BOUNCE_HEIGHT = 0.3; // ひっくり返る時のバウンド高さ
const FLIP_START_DELAY = 150; // 駒が置かれてからひっくり返り始めるまでの遅延 (ms)

const START_MESSAGE_DURATION = 2500; // 先行/後攻メッセージ表示時間 (ms)

// ★追加: 駒を置くアニメーション用の変数★
let placingPieces = [];
const PLACE_ANIMATION_DURATION = 400; // 駒を置くアニメーションの長さ (ms)
const BOUNCE_HEIGHT = 0.5; // 置く時のバウンド高さ

let passMessageDiv;
let cpuThinkingMessageDiv;
let gameOverScreen;
let gameOverTitle;
let gameOverScore;
let playAgainButton;

let firstPlayerMessageDiv; // 先行/後攻メッセージ表示用のDOM要素

const directions = [];
for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dy === 0 && dz === 0) continue; // 自分自身はスキップ
            directions.push({ dx, dy, dz });
        }
    }
}

// --- ゲーム初期化関数 ---
function initGame(selectedGridSize) {
    currentSelectedSize = selectedGridSize;
    gridSize = selectedGridSize;
    cellSize = 1; // セルのサイズは常に1と仮定

    // offsetの計算を修正: 盤面の中心が原点になるように
    offset = (gridSize * cellSize) / 2 - (cellSize / 2);

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
    scene.background = new THREE.Color(0xA9A9A9); // グレー

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // カメラ位置を調整: 盤面全体が見えるように
    camera.position.set(offset, offset + gridSize * 1.5, offset + gridSize * 2);
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
                cell.raycast = function() {}; // ハイライトメッシュとの交差判定から除外するため
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
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5
    });
    const outerBox = new THREE.LineSegments(outerBoxGeometry, outerBoxMaterial);
    scene.add(outerBox);

    // 外枠を少し太く見せるための追加の線
    const outerBoxMaterialThicker = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5
    });
    const pointsThicker = points.map(v => v.clone().multiplyScalar(1.01)); // 少し拡大
    const outerBoxGeometryThicker = new THREE.BufferGeometry().setFromPoints(pointsThicker);
    outerBoxGeometryThicker.setIndex(indices);
    const outerBoxThicker = new THREE.LineSegments(outerBoxGeometryThicker, outerBoxMaterialThicker);
    scene.add(outerBoxThicker);

    // --- 内部グリッド線の描画 ---
    const gridLineMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff00, // 緑色
        transparent: true,
        opacity: 0.2 // 外枠より薄く
    });

    // X軸に平行な線 (YZ平面上)
    for (let y = 0; y <= gridSize; y++) {
        const y_pos = -outerBoxHalfSize + y * cellSize;
        for (let z = 0; z <= gridSize; z++) {
            const z_pos = -outerBoxHalfSize + z * cellSize;
            // X軸に平行な線は、X座標が-outerBoxHalfSizeからouterBoxHalfSizeまで変化
            const points = [
                new THREE.Vector3(-outerBoxHalfSize, y_pos, z_pos),
                new THREE.Vector3(outerBoxHalfSize, y_pos, z_pos)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            scene.add(new THREE.LineSegments(geometry, gridLineMaterial));
        }
    }

    // Y軸に平行な線 (XZ平面上)
    for (let x = 0; x <= gridSize; x++) {
        const x_pos = -outerBoxHalfSize + x * cellSize;
        for (let z = 0; z <= gridSize; z++) {
            const z_pos = -outerBoxHalfSize + z * cellSize;
            // Y軸に平行な線は、Y座標が-outerBoxHalfSizeからouterBoxHalfSizeまで変化
            const points = [
                new THREE.Vector3(x_pos, -outerBoxHalfSize, z_pos),
                new THREE.Vector3(x_pos, outerBoxHalfSize, z_pos)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            scene.add(new THREE.LineSegments(geometry, gridLineMaterial));
        }
    }

    // Z軸に平行な線 (XY平面上)
    for (let x = 0; x <= gridSize; x++) {
        const x_pos = -outerBoxHalfSize + x * cellSize;
        for (let y = 0; y <= gridSize; y++) {
            const y_pos = -outerBoxHalfSize + y * cellSize;
            // Z軸に平行な線は、Z座標が-outerBoxHalfSizeからouterBoxHalfSizeまで変化
            const points = [
                new THREE.Vector3(x_pos, y_pos, -outerBoxHalfSize),
                new THREE.Vector3(x_pos, y_pos, outerBoxHalfSize)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            scene.add(new THREE.LineSegments(geometry, gridLineMaterial));
        }
    }
    // --- 内部グリッド線の描画 終わり ---


    pieceGeometry = new THREE.SphereGeometry(0.4, 32, 32);
    blackMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
    whiteMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

    pieces = [];

    // 初期配置のデータ
    const initialPiecesData = [
        { x: (gridSize/2)-1, y: (gridSize/2)-1, z: (gridSize/2)-1, player: -1 }, // 黒
        { x: (gridSize/2), y: (gridSize/2), z: (gridSize/2)-1, player: -1 },     // 黒
        { x: (gridSize/2)-1, y: (gridSize/2), z: (gridSize/2), player: -1 },     // 黒
        { x: (gridSize/2), y: (gridSize/2)-1, z: (gridSize/2), player: -1 },     // 黒
        { x: (gridSize/2)-1, y: (gridSize/2), z: (gridSize/2)-1, player: 1 },    // 白
        { x: (gridSize/2), y: (gridSize/2)-1, z: (gridSize/2)-1, player: 1 },    // 白
        { x: (gridSize/2)-1, y: (gridSize/2)-1, z: (gridSize/2), player: 1 },    // 白
        { x: (gridSize/2), y: (gridSize/2), z: (gridSize/2), player: 1 }         // 白
    ];

    initialPiecesData.forEach(data => {
        placePiece(data.x, data.y, data.z, data.player);
    });

    highlightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00, // 黄色
        transparent: true,
        opacity: 0.4,
        depthTest: false,
        depthWrite: false
    });
    highlightGeometry = new THREE.BoxGeometry(cellSize * 0.5, cellSize * 0.5, cellSize * 0.5);

    highlightMeshes = [];

    isCpuTurn = false;

    animate();
}

// --- ゲームロジック関連関数 ---
// ★placePiece関数の変更★
function placePiece(x, y, z, player) {
    if (board[x][y][z] !== 0) {
        console.warn(`Attempted to place piece on occupied cell at (${x}, ${y}, ${z})`);
        return;
    }

    const materialToUse = (player === -1) ? blackMaterial : whiteMaterial;
    const piece = new THREE.Mesh(pieceGeometry, materialToUse);
    
    // 駒の最終的な位置を計算 (アニメーションの目標地点)
    const targetYPosition = y * cellSize - offset;
    
    // アニメーション開始時の位置を設定 (少し上から)
    piece.position.set(
        x * cellSize - offset,
        targetYPosition + BOUNCE_HEIGHT, // 初期位置を少し高くする
        z * cellSize - offset
    );
    
    scene.add(piece);
    board[x][y][z] = player; // 盤面データにプレイヤーを記録

    piece.userData.boardX = x;
    piece.userData.boardY = y;
    piece.userData.boardZ = z;
    piece.userData.player = player;

    piece.raycast = function() {}; // ハイライトメッシュとの交差判定から除外するため

    pieces.push(piece); // シーン上の駒リストに追加
    
    // ★追加: placingPiecesリストに新しい駒のアニメーション情報を追加★
    placingPieces.push({
        piece: piece,
        startTime: performance.now(),
        initialY: targetYPosition + BOUNCE_HEIGHT,
        targetY: targetYPosition
    });
}

function getFlippablePieces(currentBoard, x, y, z, player) {
    // 指定された座標が盤面外、または既に駒が置かれている場合は、ひっくり返る駒はない
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize || z < 0 || z >= gridSize) {
        return [];
    }
    if (currentBoard[x][y][z] !== 0) {
        return [];
    }

    const flippableInAllDirections = []; // 全ての方向でひっくり返る駒を格納する配列

    // 26方向（3x3x3 - 中心1マス）全てについて探索
    for (const dir of directions) {
        const potentialFlippableInThisDirection = []; // 現在の方向でひっくり返る可能性のある駒を一時的に格納
        let currentX = x + dir.dx;
        let currentY = y + dir.dy;
        let currentZ = z + dir.dz;

        // 探索開始点が盤面外ならこの方向はスキップ
        if (currentX < 0 || currentX >= gridSize ||
            currentY < 0 || currentY >= gridSize ||
            currentZ < 0 || currentZ >= gridSize) {
            continue;
        }

        // 探索開始点にある駒の色を取得
        let firstNeighbor = currentBoard[currentX][currentY][currentZ];

        // 探索開始点に駒がない（空）か、自分の駒があれば、この方向では挟めないのでスキップ
        if (firstNeighbor === 0 || firstNeighbor === player) {
            continue;
        }

        // 探索開始点に相手の駒があれば、ひっくり返る候補として追加
        potentialFlippableInThisDirection.push({ x: currentX, y: currentY, z: currentZ });

        // さらにその方向へ1マス進む
        currentX += dir.dx;
        currentY += dir.dy;
        currentZ += dir.dz;

        // 盤面内である限り、同じ方向へ探索を続ける
        while (
            currentX >= 0 && currentX < gridSize &&
            currentY >= 0 && currentY < gridSize &&
            currentZ >= 0 && currentZ < gridSize
        ) {
            const cellValue = currentBoard[currentX][currentY][currentZ];

            if (cellValue === 0) {
                // 空のマスを見つけたら、挟み込みが成立しないのでこの方向は終了
                break;
            } else if (cellValue === player) {
                // 自分の駒を見つけたら、挟み込み成立！
                // `potentialFlippableInThisDirection` に溜まっていた駒を確定として追加
                flippableInAllDirections.push(...potentialFlippableInThisDirection);
                break; // この方向の探索を終了
            } else {
                // 相手の駒を見つけたら、ひっくり返る候補として追加し、さらに奥へ探索を続ける
                potentialFlippableInThisDirection.push({ x: currentX, y: currentY, z: currentZ });
            }

            // さらに1マス進む
            currentX += dir.dx;
            currentY += dir.dy;
            currentZ += dir.dz;
        }
    }
    return flippableInAllDirections; // 最終的にひっくり返す駒のリストを返す
}

// --- 可能な手を取得し、ハイライトを更新する関数 ---
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
        highlightMesh.material.depthTest = false;
        scene.add(highlightMesh);
        highlightMeshes.push(highlightMesh);
    });
}

// --- 駒をひっくり返すアニメーションを更新する関数 (animate関数より上に移動) ---
function updateFlippingPieces(currentTime) {
    const stillFlipping = [];
    flippingPieces.forEach(item => {
        const elapsed = currentTime - item.startTime;
        const progress = Math.min(elapsed / FLIP_DURATION, 1);

        // Y軸方向のバウンドアニメーションを追加
        // 0から1まで上昇し、1から0まで下降するようなカーブ
        const yOffset = FLIP_BOUNCE_HEIGHT * Math.sin(progress * Math.PI); // progress 0から1でsin(0)からsin(PI)へ、0から1まで上がりまた0へ

        item.piece.rotation.y = Math.PI * progress * 2; // Y軸を中心に回転
        item.piece.position.y = item.targetY + yOffset; // Y位置を更新

        if (progress < 0.5) {
            item.piece.material = item.originalMaterial; // 前半は元の色
        } else {
            item.piece.material = item.targetMaterial; // 後半は目標の色
        }

        if (progress < 1) {
            stillFlipping.push(item);
        } else {
            item.piece.rotation.y = 0; // アニメーション完了後は回転をリセット
            item.piece.position.y = item.targetY; // アニメーション完了後、正確な最終位置に設定
            item.resolve();
        }
    });
    flippingPieces = stillFlipping;
}

// --- 駒を置くアニメーションを更新する関数 (animate関数より上に移動) ---
function updatePlacingPieces(currentTime) {
    const stillPlacing = [];
    placingPieces.forEach(item => {
        const elapsed = currentTime - item.startTime;
        const progress = Math.min(elapsed / PLACE_ANIMATION_DURATION, 1);

        // バウンドのアニメーションカーブ (例: 放物線)
        // progress * (2 - progress) は 0から1まで上昇し、1から0まで下降するようなカーブ (放物線の上半分)
        // これを1から0の動きとして使い、バウンドの高さを調整
        const yOffset = BOUNCE_HEIGHT * Math.sin(progress * Math.PI); // progress 0から1でsin(0)からsin(PI)へ、0から1まで上がりまた0へ

        // 駒のY位置を更新
        // 目標位置 + バウンドのオフセット
        item.piece.position.y = item.targetY + yOffset;

        if (progress < 1) {
            stillPlacing.push(item);
        } else {
            // アニメーション完了後、正確な最終位置に設定
            item.piece.position.y = item.targetY;
        }
    });
    placingPieces = stillPlacing;
}

// --- アニメーションループ ---
let lastFrameTime = 0;
function animate(currentTime) {
    requestAnimationFrame(animate);

    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    controls.update();
    updateFlippingPieces(currentTime);
    updatePlacingPieces(currentTime);
    renderer.render(scene, camera);
}


// --- ターン進行を制御するヘルパー関数 ---
function checkAndAdvanceTurn() {
    updatePossibleMoves(); // 現在のプレイヤーの可能な手を更新 (これでハイライトも更新される)
    updateUI(); // UIを更新してスコアと現在のターンを反映

    // 可能な手が一つもない場合
    if (currentPossibleMoves.length === 0) {
        console.log(`Player ${currentPlayer === -1 ? '黒' : '白'} has no moves. Attempting to pass turn.`);
        showPassMessage(); // パスメッセージ表示

        const prevPlayer = currentPlayer; // パスする前のプレイヤーを保存
        currentPlayer *= -1; // ターンを相手に渡す

        // 相手の可能な手をチェック
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
            // 両者パスでゲーム終了
            console.log("Both players passed. Game Over!");
            endGame();
            isCpuTurn = false; // ゲーム終了時はCPUターンではない
        } else {
            // 相手は動けるので、ゲーム続行（必要ならCPUターンをトリガー）
            console.log(`Player ${currentPlayer === -1 ? '黒' : '白'} has moves. Game continues after a pass.`);
            if (currentPlayer === CPU_PLAYER) {
                isCpuTurn = true;
                showCpuThinkingMessage();
                setTimeout(cpuMove, 1000); // CPUのターンをトリガー
            } else {
                isCpuTurn = false; // プレイヤーのターン
            }
        }
    } else {
        // 可能な手がある場合、通常のターン進行
        console.log(`Possible moves for ${currentPlayer === -1 ? '黒' : '白'}:`, currentPossibleMoves.length, currentPossibleMoves);
        if (currentPlayer === CPU_PLAYER) {
            isCpuTurn = true;
            showCpuThinkingMessage();
            setTimeout(cpuMove, 1000); // CPUのターンをトリガー
        } else {
            isCpuTurn = false; // プレイヤーのターン
        }
    }
}


function cpuMove() {
    hideCpuThinkingMessage();

    if (currentPossibleMoves.length > 0) {
        let selectedMove;
        let flippablePiecesForActualMove;

        if (cpuDifficulty === 1) { // レベル1: ランダム
            const randomIndex = Math.floor(Math.random() * currentPossibleMoves.length);
            selectedMove = currentPossibleMoves[randomIndex];
            flippablePiecesForActualMove = getFlippablePieces(board, selectedMove.x, selectedMove.y, selectedMove.z, CPU_PLAYER);

        } else if (cpuDifficulty === 2) { // レベル2: 最大反転
            let maxFlips = -1;
            let bestMoves = [];
            let bestMovesFlippableLists = [];

            currentPossibleMoves.forEach(move => {
                const flippable = getFlippablePieces(board, move.x, move.y, move.z, CPU_PLAYER);
                
                if (flippable.length > maxFlips) {
                    maxFlips = flippable.length;
                    bestMoves = [move];
                    bestMovesFlippableLists = [flippable];
                } else if (flippable.length === maxFlips) {
                    bestMoves.push(move);
                    bestMovesFlippableLists.push(flippable);
                }
            });

            const randomIndex = Math.floor(Math.random() * bestMoves.length);
            selectedMove = bestMoves[randomIndex];
            flippablePiecesForActualMove = bestMovesFlippableLists[randomIndex];
        }

        // 駒を実際に置く
        placePiece(selectedMove.x, selectedMove.y, selectedMove.z, CPU_PLAYER);
        console.log(`CPU placed piece at: (${selectedMove.x}, ${selectedMove.y}, ${selectedMove.z})`);

        // 盤面データ上の駒の色を即座に更新 (既に計算済みの flippablePiecesForActualMove を使用)
        flippablePiecesForActualMove.forEach(coord => {
            board[coord.x][coord.y][coord.z] = CPU_PLAYER;
        });

        // ★変更: 駒が置かれてから少し遅れて反転アニメーションを開始★
        setTimeout(() => {
            let flipPromises = flippablePiecesForActualMove.map(coord => flipPieceVisual(coord.x, coord.y, coord.z, CPU_PLAYER));
            Promise.all(flipPromises).then(() => {
                currentPlayer *= -1; // プレイヤーを交代
                console.log(`Next player: ${currentPlayer === -1 ? '黒' : '白'}`);
                checkAndAdvanceTurn(); // ターン進行のヘルパー関数を呼び出す
            });
        }, FLIP_START_DELAY); // 定義した遅延時間

    } else {
        console.log("CPU has no moves. Passing.");
        currentPlayer *= -1; // プレイヤーを交代
        checkAndAdvanceTurn(); // ターン進行のヘルパー関数を呼び出す
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

            flippablePieces.forEach(coord => {
                board[coord.x][coord.y][coord.z] = currentPlayer;
            });

            // ★変更: 駒が置かれてから少し遅れて反転アニメーションを開始★
            setTimeout(() => {
                let flipPromises = flippablePieces.map(coord => flipPieceVisual(coord.x, coord.y, coord.z, currentPlayer));
                Promise.all(flipPromises).then(() => {
                    currentPlayer *= -1; // プレイヤーを交代
                    console.log(`Next player: ${currentPlayer === -1 ? '黒' : '白'}`);
                    checkAndAdvanceTurn(); // ターン進行のヘルパー関数を呼び出す
                });
            }, FLIP_START_DELAY); // 定義した遅延時間

        } else {
            console.log(`Error: Clicked highlighted cell (${x}, ${y}, ${z}), but no pieces to flip. (Logic error)`);
        }
    } else {
        console.log("No highlighted cell clicked. Please click on a highlighted cell.");
    }
};

// ★flipPieceVisual関数の変更★
function flipPieceVisual(x, y, z, newPlayer) {
    return new Promise(resolve => {
        const pieceToFlip = pieces.find(piece =>
            piece.userData.boardX === x &&
            piece.userData.boardY === y &&
            piece.userData.boardZ === z
        );

        if (!pieceToFlip) {
            console.warn(`Warning: Piece not found at (${x}, ${y}, ${z}) for flipping. This might indicate a board data inconsistency.`);
            resolve();
            return;
        }

        const originalMaterial = pieceToFlip.material;
        const targetMaterial = (newPlayer === -1) ? blackMaterial : whiteMaterial;
        const startTime = performance.now();

        // 駒の目標Y位置を保存 (バウンドアニメーション用)
        const targetY = pieceToFlip.position.y;

        flippingPieces.push({
            piece: pieceToFlip,
            startTime: startTime,
            originalMaterial: originalMaterial,
            targetMaterial: targetMaterial,
            newPlayer: newPlayer,
            resolve: resolve,
            targetY: targetY // 目標Y位置をアニメーション情報に追加
        });

        pieceToFlip.userData.player = newPlayer;
    });
}


function updateUI() {
    const turnColorSpan = document.getElementById('turn-color');
    const blackScoreSpan = document.getElementById('black-score');
    const whiteScoreSpan = document.getElementById('white-score');

    if (turnColorSpan) turnColorSpan.textContent = currentPlayer === -1 ? '黒' : '白';
    if (turnColorSpan) turnColorSpan.style.color = currentPlayer === -1 ? 'black' : 'white';
    if (turnColorSpan) turnColorSpan.style.textShadow = currentPlayer === -1 ? '1px 1px 2px white' : '1px 1px 2px black';

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

    if (blackScoreSpan) blackScoreSpan.textContent = blackCount;
    if (whiteScoreSpan) whiteScoreSpan.textContent = whiteCount;
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
    firstPlayerMessageDiv = document.getElementById('first-player-message'); 

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

function selectBoardSize(size) {
    currentSelectedSize = size;
    const boardSizeSelection = document.getElementById('board-size-selection');
    const difficultySelection = document.getElementById('difficulty-selection');
    const startScreenTitle = document.getElementById('start-screen-title');

    if (boardSizeSelection) {
        boardSizeSelection.style.display = 'none';
    }
    if (difficultySelection) {
        difficultySelection.style.display = 'block';
    }
    if (startScreenTitle) {
        startScreenTitle.textContent = `3D オセロ (${size}x${size}x${size})`;
    }
}

function selectDifficultyAndStartGame(difficulty) {
    cpuDifficulty = difficulty;
    const startScreen = document.getElementById('start-screen');

    if (startScreen) {
        startScreen.style.display = 'none';
    }
    if (gameOverScreen) {
        gameOverScreen.style.display = 'none';
    }
    
    initGame(currentSelectedSize);
    window.addEventListener('click', handleGameClick);
    
    // ランダムで先行プレイヤーを決定
    currentPlayer = (Math.random() < 0.5) ? PLAYER_PLAYER : CPU_PLAYER;
    console.log(`先行プレイヤー: ${currentPlayer === PLAYER_PLAYER ? 'プレイヤー（黒）' : 'CPU（白）'}`);

    // 先行/後攻メッセージを表示
    let messageText;
    if (currentPlayer === PLAYER_PLAYER) {
        messageText = "あなたが**先行**です！";
    } else {
        messageText = "あなたが**後攻**です！";
    }
    showFirstPlayerMessage(messageText);

    // メッセージ表示後にターンの進行を始める
    setTimeout(() => {
        // ゲーム開始時の最初のターン進行
        checkAndAdvanceTurn(); 
    }, START_MESSAGE_DURATION + 500); // メッセージ表示時間 + 少しの間を空ける
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
    if (firstPlayerMessageDiv) firstPlayerMessageDiv.style.display = 'none'; // リセット時にも非表示にする

    window.removeEventListener('click', handleGameClick);
    if (scene) {
        while(scene.children.length > 0){
            scene.remove(scene.children[0]);
        }
    }
    if (renderer && renderer.domElement && document.body.contains(renderer.domElement)) {
        document.body.removeChild(renderer.domElement);
        renderer = null;
    } else if (renderer && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer = null;
    }
    
    board = [];
    pieces = [];
    highlightMeshes = [];
    flippingPieces = [];
    placingPieces = []; // ★追加: placingPiecesもリセット★
    currentPlayer = -1;
    isCpuTurn = false;
    currentPossibleMoves = [];
    updateUI();
}

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

function showCpuThinkingMessage() {
    if (cpuThinkingMessageDiv) {
        cpuThinkingMessageDiv.style.display = 'block';
        cpuThinkingMessageDiv.style.animation = 'none';
        void cpuThinkingMessageDiv.offsetWidth;
    }
}

function hideCpuThinkingMessage() {
    if (cpuThinkingMessageDiv) {
        cpuThinkingMessageDiv.style.display = 'none';
    }
}

// 先行/後攻メッセージ表示関数
function showFirstPlayerMessage(message) {
    if (firstPlayerMessageDiv) {
        firstPlayerMessageDiv.innerHTML = message;
        firstPlayerMessageDiv.style.display = 'block';
        firstPlayerMessageDiv.style.animation = 'none'; // アニメーションをリセット
        void firstPlayerMessageDiv.offsetWidth; // リフローを強制してアニメーションを再トリガー
        firstPlayerMessageDiv.style.animation = `fadeInOut ${START_MESSAGE_DURATION / 1000}s ease-in-out forwards`; // 長めに表示
        setTimeout(() => {
            firstPlayerMessageDiv.style.display = 'none';
        }, START_MESSAGE_DURATION);
    }
}


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