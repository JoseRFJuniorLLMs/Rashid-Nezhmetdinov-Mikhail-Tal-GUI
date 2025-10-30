/**
 * ==============================================
 * MÓDULO: JOGAR CONTRA STOCKFISH
 * ==============================================
 * Com drag-and-drop, setas e marcações estilo Chess.com
 */

const PlayVsStockfish = (function() {
    'use strict';

    // =====================================
    // ESTADO PRIVADO DO MÓDULO
    // =====================================
    let gameInstance = null;
    let userColor = 'w';
    let selectedSquare = null;
    let isActive = false;
    let stockfishWorker = null;
    let waitingForMove = false;
    let difficulty = 'medium';
    let draggedPiece = null;
    let draggedFrom = null;
    
    const DIFFICULTY_SETTINGS = {
        easy: { depth: 5, time: 1000, skill: 5 },
        medium: { depth: 10, time: 2000, skill: 10 },
        hard: { depth: 15, time: 3000, skill: 15 },
        extreme: { depth: 20, time: 5000, skill: 20 }
    };

    // =====================================
    // INICIALIZAÇÃO
    // =====================================
    function init(stockfishInstance) {
        stockfishWorker = stockfishInstance;
        attachEventListeners();
        console.log('✅ Módulo PlayVsStockfish inicializado');
    }

    function attachEventListeners() {
        $('#btn-play-vs-stockfish').on('click', showGameSetupDialog);
    }

    // =====================================
    // DIALOG DE CONFIGURAÇÃO
    // =====================================
    function showGameSetupDialog() {
        const html = `
            <div id="game-setup-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; 
                background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center;">
                <div style="background:#3F3E3A; padding:30px; border-radius:10px; border:2px solid #B58863; max-width:400px;">
                    <h2 style="color:#F0D9B5; margin-top:0;">🎮 Jogar contra Stockfish</h2>
                    
                    <label style="color:#F0D9B5; display:block; margin:15px 0 5px;">Escolha sua cor:</label>
                    <select id="select-user-color" style="width:100%; padding:10px; background:#2a2926; color:#fff; border:1px solid #B58863; border-radius:5px;">
                        <option value="w">♔ Brancas</option>
                        <option value="b">♚ Pretas</option>
                    </select>

                    <label style="color:#F0D9B5; display:block; margin:15px 0 5px;">Dificuldade:</label>
                    <select id="select-difficulty" style="width:100%; padding:10px; background:#2a2926; color:#fff; border:1px solid #B58863; border-radius:5px;">
                        <option value="easy">😊 Fácil (Depth 5)</option>
                        <option value="medium" selected>😐 Médio (Depth 10)</option>
                        <option value="hard">😤 Difícil (Depth 15)</option>
                        <option value="extreme">🔥 Extremo (Depth 20)</option>
                    </select>

                    <div style="margin-top:25px; display:flex; gap:10px;">
                        <button id="btn-start-game" class="myButton" style="flex:1; background:#4CAF50; color:#fff;">
                            Iniciar Jogo
                        </button>
                        <button id="btn-cancel-setup" class="myButton" style="flex:1;">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        $('body').append(html);
        
        $('#btn-start-game').on('click', function() {
            userColor = $('#select-user-color').val();
            difficulty = $('#select-difficulty').val();
            $('#game-setup-overlay').remove();
            startGame();
        });
        
        $('#btn-cancel-setup').on('click', function() {
            $('#game-setup-overlay').remove();
        });
    }

    // =====================================
    // INICIAR JOGO
    // =====================================
    function startGame() {
        gameInstance = new Chess();
        isActive = true;
        selectedSquare = null;
        waitingForMove = false;

        // Esconder elementos do modo PGN
        $('.pgn-navigation').hide();
        $('#pgn-score-sheet').hide();
        $('#pgn-status').hide();
        $('#player-white-name').hide();
        $('#player-black-name').hide();
        $('.pgn-loader-section').hide();
        $('#opening-name').hide();
        $('#opening-history-box').hide();

        // Limpar setas antigas
        clearMoveArrow();

        // Mostrar UI do modo jogo
        showGameUI();
        updateBoardFromGame();
        enableBoardInteraction();

        if (userColor === 'b') {
            setTimeout(() => getStockfishMove(), 500);
        } else {
            updateGameStatus('Sua vez! Arraste ou clique nas peças para mover.');
        }

        console.log(`🎮 Jogo iniciado: Usuário=${userColor}, Dificuldade=${difficulty}`);
    }

    // =====================================
    // UI DO MODO JOGO
    // =====================================
    function showGameUI() {
        const whiteName = userColor === 'w' ? '👤 Você' : '🤖 Stockfish';
        const blackName = userColor === 'b' ? '👤 Você' : '🤖 Stockfish';

        const gameUIHtml = `
            <div id="game-mode-ui" style="background:#2a2926; border:2px solid #B58863; border-radius:5px; padding:15px; margin-bottom:15px;">
                <h3 style="margin:0 0 10px; color:#F0D9B5; display:flex; justify-content:space-between; align-items:center;">
                    <span>🎮 Modo Jogo</span>
                    <button id="btn-exit-game-mode" class="myButton" style="padding:5px 10px; font-size:12px;">
                        ❌ Sair
                    </button>
                </h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                    <div style="text-align:center; padding:8px; background:#3F3E3A; border-radius:4px;">
                        <div style="font-size:0.85em; color:#ccc;">Brancas</div>
                        <div style="font-weight:bold; color:#F0D9B5;">${whiteName}</div>
                    </div>
                    <div style="text-align:center; padding:8px; background:#3F3E3A; border-radius:4px;">
                        <div style="font-size:0.85em; color:#ccc;">Pretas</div>
                        <div style="font-weight:bold; color:#F0D9B5;">${blackName}</div>
                    </div>
                </div>
                <div id="game-status" style="background:#3F3E3A; padding:10px; border-radius:4px; color:#F0D9B5; text-align:center; font-size:0.9em;">
                    Preparando jogo...
                </div>
                <div id="game-move-list" style="background:#f7f7f7; color:#333; font-family:monospace; font-size:0.85em; max-height:200px; overflow-y:auto; border-radius:4px; padding:8px; margin-top:10px;">
                </div>
            </div>
        `;

        $('.sidebar-left').prepend(gameUIHtml);
        $('#btn-exit-game-mode').on('click', exitGameMode);
    }

    function updateGameStatus(message) {
        $('#game-status').html(message);
    }

    // =====================================
    // INTERAÇÃO COM TABULEIRO (DRAG + CLICK)
    // =====================================
    function enableBoardInteraction() {
        // Desabilitar interações antigas
        $('.chess-square').off('click.playmode mousedown.playmode dragstart.playmode drop.playmode dragover.playmode');

        // Click para selecionar/mover
        $('.chess-square').on('click.playmode', handleSquareClick);

        // Drag and Drop
        $('.chess-square').on('mousedown.playmode', handleMouseDown);
        $('.chess-square').on('dragover.playmode', handleDragOver);
        $('.chess-square').on('drop.playmode', handleDrop);

        // Prevenir comportamento padrão de drag do browser
        $('.chess-square').on('dragstart.playmode', function(e) {
            e.preventDefault();
        });
    }

    function disableBoardInteraction() {
        $('.chess-square').off('click.playmode mousedown.playmode dragstart.playmode drop.playmode dragover.playmode mousemove.playmode mouseup.playmode');
        $(document).off('mousemove.playmode mouseup.playmode');
    }

    // ===== CLICK HANDLER =====
    function handleSquareClick(e) {
        if (!isActive || waitingForMove || gameInstance.game_over()) return;
        if (gameInstance.turn() !== userColor) return;
        if (draggedPiece) return; // Ignore clicks durante drag

        const clickedSquare = $(this).attr('id');
        const piece = gameInstance.get(clickedSquare);

        if (selectedSquare) {
            const move = attemptMove(selectedSquare, clickedSquare);
            if (move) {
                afterUserMove(move);
            } else {
                if (piece && piece.color === userColor) {
                    selectSquare(clickedSquare);
                } else {
                    clearSelection();
                }
            }
        } else {
            if (piece && piece.color === userColor) {
                selectSquare(clickedSquare);
            }
        }
    }

    // ===== DRAG HANDLERS =====
    function handleMouseDown(e) {
        if (!isActive || waitingForMove || gameInstance.game_over()) return;
        if (gameInstance.turn() !== userColor) return;

        const square = $(this).attr('id');
        const piece = gameInstance.get(square);

        if (piece && piece.color === userColor) {
            e.preventDefault();
            draggedFrom = square;
            
            // Criar elemento visual da peça sendo arrastada
            const $square = $(this);
            const bgImage = $square.css('background-image');
            
            draggedPiece = $('<div>')
                .css({
                    position: 'fixed',
                    width: '60px',
                    height: '60px',
                    backgroundImage: bgImage,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    pointerEvents: 'none',
                    zIndex: 10000,
                    opacity: 0.8,
                    left: e.pageX - 30,
                    top: e.pageY - 30
                })
                .appendTo('body');

            // Mostrar movimentos válidos
            selectSquare(square);

            // Listeners globais para movimento e soltar
            $(document).on('mousemove.playmode', handleMouseMove);
            $(document).on('mouseup.playmode', handleMouseUp);
        }
    }

    function handleMouseMove(e) {
        if (draggedPiece) {
            draggedPiece.css({
                left: e.pageX - 30,
                top: e.pageY - 30
            });
        }
    }

    function handleMouseUp(e) {
        if (!draggedPiece) return;

        // Encontrar casa alvo
        const targetSquare = document.elementFromPoint(e.clientX, e.clientY);
        const $target = $(targetSquare).closest('.chess-square');

        if ($target.length && draggedFrom) {
            const toSquare = $target.attr('id');
            const move = attemptMove(draggedFrom, toSquare);
            
            if (move) {
                afterUserMove(move);
            }
        }

        // Limpar drag
        if (draggedPiece) {
            draggedPiece.remove();
            draggedPiece = null;
        }
        draggedFrom = null;
        
        $(document).off('mousemove.playmode mouseup.playmode');
        
        // Se não moveu, manter seleção
        if (!move) {
            // Seleção já está ativa, não fazer nada
        } else {
            clearSelection();
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
    }

    function handleDrop(e) {
        e.preventDefault();
    }

    // ===== SELEÇÃO E MOVIMENTOS =====
    function selectSquare(square) {
        clearSelection();
        selectedSquare = square;
        
        const moves = gameInstance.moves({ square: square, verbose: true });
        
        // Marcar casa selecionada (círculo amarelo)
        $(`#${square}`).addClass('game-selected-square');
        
        // Marcar movimentos válidos com círculos
        moves.forEach(m => {
            const $targetSquare = $(`#${m.to}`);
            const hasPiece = gameInstance.get(m.to);
            
            if (hasPiece) {
                // Casa com peça inimiga - círculo de captura maior
                $targetSquare.addClass('game-capture-square');
            } else {
                // Casa vazia - círculo pequeno
                $targetSquare.addClass('game-possible-move');
            }
        });
    }

    function clearSelection() {
        $('.chess-square').removeClass('game-selected-square game-possible-move game-capture-square');
        selectedSquare = null;
    }

    function attemptMove(from, to) {
        let move = gameInstance.move({ from, to, promotion: 'q' });
        
        if (!move) {
            const piece = gameInstance.get(from);
            if (piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1')) {
                const promo = prompt('Promover para:\nq = Rainha, r = Torre, n = Cavalo, b = Bispo', 'q');
                if (promo && ['q', 'r', 'n', 'b'].includes(promo.toLowerCase())) {
                    move = gameInstance.move({ from, to, promotion: promo.toLowerCase() });
                }
            }
        }
        
        return move;
    }

    function afterUserMove(move) {
        clearSelection();
        updateBoardFromGame();
        drawMoveArrow(move.from, move.to);
        addMoveToList(move);
        playMoveSound(move);

        if (checkGameOver()) return;

        waitingForMove = true;
        updateGameStatus('🤖 Stockfish pensando...');
        disableBoardInteraction();
        
        setTimeout(() => getStockfishMove(), 300);
    }

    // =====================================
    // STOCKFISH MOVE
    // =====================================
    function getStockfishMove() {
        const fen = gameInstance.fen();
        const settings = DIFFICULTY_SETTINGS[difficulty];

        stockfishWorker.postMessage('stop');
        stockfishWorker.postMessage('setoption name Skill Level value ' + settings.skill);
        stockfishWorker.postMessage('position fen ' + fen);
        stockfishWorker.postMessage('go depth ' + settings.depth + ' movetime ' + settings.time);

        const handler = function(event) {
            const line = event.data;
            
            if (line.startsWith('bestmove')) {
                stockfishWorker.removeEventListener('message', handler);
                
                const bestMove = line.split(' ')[1];
                if (bestMove && bestMove !== '(none)') {
                    applyStockfishMove(bestMove);
                } else {
                    updateGameStatus('Stockfish não encontrou movimento válido.');
                }
            }
        };

        stockfishWorker.addEventListener('message', handler);
    }

    function applyStockfishMove(moveStr) {
        const from = moveStr.substring(0, 2);
        const to = moveStr.substring(2, 4);
        const promotion = moveStr[4] || 'q';

        const move = gameInstance.move({ from, to, promotion });
        
        if (move) {
            updateBoardFromGame();
            drawMoveArrow(from, to);
            addMoveToList(move);
            playMoveSound(move);

            if (!checkGameOver()) {
                waitingForMove = false;
                enableBoardInteraction();
                updateGameStatus('Sua vez!');
            }
        }
    }

    // =====================================
    // ATUALIZAÇÃO DO TABULEIRO
    // =====================================
    function updateBoardFromGame() {
        $('.chess-square').css('background-image', 'none');

        const pieceImages = {
            'p': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/bp.png',
            'n': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/bn.png',
            'b': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/bb.png',
            'r': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/br.png',
            'q': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/bq.png',
            'k': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/bk.png',
            'P': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/wp.png',
            'N': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/wn.png',
            'B': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/wb.png',
            'R': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/wr.png',
            'Q': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/wq.png',
            'K': 'https://images.chesscomfiles.com/chess-themes/pieces/classic/150/wk.png'
        };

        const fen = gameInstance.fen();
        const position = fen.split(' ')[0];
        const ranks = position.split('/');

        for (let i = 0; i < 8; i++) {
            const rank = 8 - i;
            let file = 0;

            for (let j = 0; j < ranks[i].length; j++) {
                const char = ranks[i][j];

                if (!isNaN(char)) {
                    file += parseInt(char);
                } else {
                    const squareName = String.fromCharCode(97 + file) + rank;
                    const imageUrl = pieceImages[char];

                    if (imageUrl) {
                        $(`#${squareName}`).css({
                            'background-image': `url("${imageUrl}")`,
                            'background-size': 'contain',
                            'background-repeat': 'no-repeat',
                            'background-position': 'center'
                        });
                    }

                    file++;
                }
            }
        }
    }

    // =====================================
    // SETA DE MOVIMENTO (Estilo Chess.com)
    // =====================================
    function drawMoveArrow(fromSquare, toSquare) {
        const svg = document.getElementById('move-arrow-layer');
        if (!svg) return;

        svg.innerHTML = '';
        svg.style.display = 'block';

        const fromEl = document.getElementById(fromSquare);
        const toEl = document.getElementById(toSquare);
        if (!fromEl || !toEl) return;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const boardRect = document.querySelector('.chess-board').getBoundingClientRect();

        const x1 = fromRect.left + fromRect.width / 2 - boardRect.left;
        const y1 = fromRect.top + fromRect.height / 2 - boardRect.top;
        const x2 = toRect.left + toRect.width / 2 - boardRect.left;
        const y2 = toRect.top + toRect.height / 2 - boardRect.top;

        // Linha da seta (verde estilo Chess.com)
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#9bca00');
        line.setAttribute('stroke-width', '8');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', '0.8');
        svg.appendChild(line);

        // Ponta da seta
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowSize = 22;
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const points = [
            [x2, y2],
            [x2 - arrowSize * Math.cos(angle - Math.PI / 6), y2 - arrowSize * Math.sin(angle - Math.PI / 6)],
            [x2 - arrowSize * Math.cos(angle + Math.PI / 6), y2 - arrowSize * Math.sin(angle + Math.PI / 6)]
        ];
        arrow.setAttribute('points', points.map(p => p.join(',')).join(' '));
        arrow.setAttribute('fill', '#9bca00');
        arrow.setAttribute('opacity', '0.8');
        svg.appendChild(arrow);
    }

    function clearMoveArrow() {
        const svg = document.getElementById('move-arrow-layer');
        if (svg) {
            svg.innerHTML = '';
            svg.style.display = 'none';
        }
    }

    // =====================================
    // HISTÓRICO DE LANCES
    // =====================================
    function addMoveToList(move) {
        const history = gameInstance.history();
        const moveNumber = Math.ceil(history.length / 2);
        const isWhite = move.color === 'w';

        const $list = $('#game-move-list');
        
        if (isWhite) {
            $list.append(`<div class="move-entry"><strong>${moveNumber}.</strong> ${move.san} `);
        } else {
            $list.find('.move-entry:last').append(`${move.san}</div>`);
        }

        $list.scrollTop($list[0].scrollHeight);
    }

    // =====================================
    // FIM DE JOGO
    // =====================================
    function checkGameOver() {
        if (gameInstance.in_checkmate()) {
            const winner = gameInstance.turn() === 'w' ? 'Pretas' : 'Brancas';
            updateGameStatus(`🏆 Xeque-mate! ${winner} venceram!`);
            disableBoardInteraction();
            playSound('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3');
            return true;
        }
        
        if (gameInstance.in_stalemate()) {
            updateGameStatus('🤝 Afogamento! Empate.');
            disableBoardInteraction();
            return true;
        }
        
        if (gameInstance.in_draw()) {
            updateGameStatus('🤝 Empate!');
            disableBoardInteraction();
            return true;
        }

        return false;
    }

    // =====================================
    // SAIR DO MODO JOGO
    // =====================================
    function exitGameMode() {
        if (!confirm('Deseja realmente sair do jogo em andamento?')) return;

        isActive = false;
        disableBoardInteraction();
        $('#game-mode-ui').remove();

        $('.pgn-navigation').show();
        $('#pgn-status').show();
        $('.pgn-loader-section').show();

        clearSelection();
        clearMoveArrow();
        $('.chess-square').css('background-image', 'none');

        console.log('🚪 Saiu do modo de jogo');
    }

    // =====================================
    // SONS
    // =====================================
    function playMoveSound(move) {
        const soundUrl = move.captured 
            ? 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3'
            : 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3';
        
        try {
            const audio = new Audio(soundUrl);
            audio.play().catch(e => console.log('Som desabilitado'));
        } catch (e) {}
    }

    function playSound(url) {
        try {
            const audio = new Audio(url);
            audio.play().catch(e => console.log('Som desabilitado'));
        } catch (e) {}
    }

    // =====================================
    // API PÚBLICA
    // =====================================
    return {
        init: init,
        isActive: () => isActive
    };
})();

window.PlayVsStockfish = PlayVsStockfish;