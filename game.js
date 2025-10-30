// ===================================
// VARIÁVEIS GLOBAIS
// ===================================

// Game state
var hits = 0;
var soundsOn = true;
var squarenames = true;
var pieces = true;
var reverse = true;

// Timer
var timeLimit = 30;
var timePassed = 0;
var timeLeft = timeLimit;
var timerInterval = null;

// PGN
var loadedPgnGame = new Chess();
var currentMoveIndex = -1;
var moveHistory = [];
var OPENING_BOOK = null;

// Stockfish
var stockfish = null;
var stockfishReady = false;
var isAnalyzing = false;
var pvData = [];
var selectedSquare = null;
var previousEvaluations = {}; // ARMAZENA AVALIAÇÕES

// Move quality definitions
const MOVE_QUALITY = {
    BRILLIANT: { threshold: 300, icon: '!!', color: '#1BADA6', label: 'brilliant' },
    GREAT: { threshold: 100, icon: '!', color: '#5C9ECC', label: 'greatmove' },
    BEST: { threshold: 50, icon: '✓', color: '#96BC4B', label: 'bestmove' },
    EXCELLENT: { threshold: 20, icon: '⚡', color: '#96BC4B', label: 'excellent' },
    GOOD: { threshold: -10, icon: '▽', color: '#96AF8B', label: 'good' },
    INACCURACY: { threshold: -50, icon: '?!', color: '#F0C15C', label: 'inaccuracy' },
    MISTAKE: { threshold: -100, icon: '?', color: '#E58F2A', label: 'mistake' },
    BLUNDER: { threshold: -Infinity, icon: '✕', color: '#CA3431', label: 'blunder' }
};

// ===================================
// STOCKFISH INITIALIZATION
// ===================================

function initStockfish() {
    console.log('Iniciando Stockfish...');

    try {
        stockfish = new Worker('stockfish.js');

        stockfish.onmessage = function (event) {
            const line = event.data;

            if (line === 'uciok' || line.startsWith('bestmove') || line.includes('multipv')) {
                console.log('Stockfish:', line);
            }

            if (line === 'uciok') {
                stockfishReady = true;
                $('#stockfish-status').html('✅ <strong>Engine pronto!</strong>').css('color', '#00ff00');
                $('#btn-analyze').prop('disabled', false);
                $('#btn-visual-analysis').prop('disabled', false);

                stockfish.postMessage('setoption name Hash value 256');
                stockfish.postMessage('setoption name Threads value 2');
                stockfish.postMessage('setoption name MultiPV value 8');
                stockfish.postMessage('ucinewgame');
            }

            if (line.startsWith('info') && line.includes('score')) {
                parseStockfishInfo(line);
            }

            if (line.startsWith('bestmove')) {
                displayBestMove(line.split(' ')[1]);
                isAnalyzing = false;
                $('#btn-analyze').text('🔍 Analisar Posição').prop('disabled', false);
            }
        };

        stockfish.onerror = function (error) {
            console.error('Erro no Worker:', error);
            showStockfishError();
        };

        stockfish.postMessage('uci');
        $('#stockfish-status').html('⏳ Inicializando...').css('color', '#ffaa00');

    } catch (e) {
        console.error('Falha ao criar Worker:', e);
        showStockfishError();
    }
}

function showStockfishError() {
    $('#stockfish-status').html(`
        <strong>❌ Engine falhou</strong><br>
        <small>Verifique se stockfish.js está na pasta</small>
    `).css('color', '#ff0000');
    $('#btn-analyze, #btn-visual-analysis').prop('disabled', true);
}

// ===================================
// STOCKFISH ANALYSIS
// ===================================

function parseStockfishInfo(line) {
    const multipv = line.match(/multipv (\d+)/)?.[1];
    const depth = line.match(/depth (\d+)/)?.[1];
    const scoreCp = line.match(/score cp (-?\d+)/)?.[1];
    const scoreMate = line.match(/score mate (-?\d+)/)?.[1];
    const pvMoves = line.match(/pv (([a-h][1-8][a-h][1-8][qnrb]? ?)+)/)?.[1];

    if (!pvMoves) return;

    const pvIndex = multipv ? parseInt(multipv) - 1 : 0;
    const firstMove = pvMoves.split(' ')[0].toUpperCase();

    let score = '';
    if (scoreCp) {
        const cp = parseInt(scoreCp) / 100;
        score = (cp >= 0 ? '+' : '') + cp.toFixed(2);
    } else if (scoreMate) {
        const mate = parseInt(scoreMate);
        score = mate > 0 ? `M${mate}` : `M${-mate}`;
    }

    pvData[pvIndex] = {
        move: firstMove,
        score: score,
        depth: parseInt(depth) || 0
    };

    if (parseInt(depth) >= 10) {
        updateMultiPVDisplay();
    }
}

function analyzePosition() {
    if (!stockfishReady) {
        alert('Engine ainda não está pronto. Aguarde.');
        return;
    }

    if (isAnalyzing) {
        console.log('Análise já em andamento...');
        return;
    }

    isAnalyzing = true;
    pvData = [];
    $('#multi-pv-list').empty();

    const svg = document.getElementById('analysis-tree-layer');
    if (svg) {
        svg.innerHTML = '';
        svg.style.display = 'none';
    }

    const fen = loadedPgnGame.fen();

    stockfish.postMessage('stop');
    stockfish.postMessage('setoption name MultiPV value 8');
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go depth 20');

    $('#btn-analyze').text('⏸️ Analisando...').prop('disabled', true);
}

function stopAnalysis() {
    if (stockfish && isAnalyzing) {
        stockfish.postMessage('stop');
        isAnalyzing = false;
        $('#btn-analyze').text('🔍 Analisar Posição').prop('disabled', false);

        const svg = document.getElementById('analysis-tree-layer');
        if (svg) {
            svg.innerHTML = '';
            svg.style.display = 'none';
        }
    }
}

function displayBestMove(move) {
    if (!move || move === '(none)') return;

    const from = move.substring(0, 2);
    const to = move.substring(2, 4);

    $('.chess-square').removeClass('highlight-from highlight-to');
    $(`#${from}`).addClass('highlight-from');
    $(`#${to}`).addClass('highlight-to');

    drawArrow(from, to);
}

function saveCurrentEvaluation() {
    if (pvData.length > 0 && pvData[0] && pvData[0].score) {
        let evalScore = pvData[0].score;

        if (evalScore.startsWith('M') || evalScore.startsWith('-M')) {
            evalScore = evalScore.includes('-') ? -900 : 900;
        } else {
            evalScore = parseFloat(evalScore) * 100;
        }

        if (!isNaN(evalScore)) {
            previousEvaluations[currentMoveIndex] = evalScore;
        }
    }
}

// ===================================
// MULTI-PV DISPLAY
// ===================================

function updateMultiPVDisplay() {
    const $list = $('#multi-pv-list');
    $list.empty();

    const svg = document.getElementById('analysis-tree-layer');
    if (svg) {
        svg.innerHTML = '';
        svg.style.display = 'none';
    }

    if (pvData.length === 0) return;

    const maxDepth = Math.max(...pvData.map(pv => pv?.depth || 0));
    if (maxDepth === 0) return;

    if (svg) {
        svg.style.display = 'block';
    }

    const colors = ['#4CAF50', '#2196F3', '#FFC107', '#FF5722', '#9C27B0'];

    pvData.forEach((pv, i) => {
        if (!pv || pv.depth < maxDepth) return;

        const moveStr = pv.move.toLowerCase();
        const from = moveStr.substring(0, 2);
        const to = moveStr.substring(2, 4);
        const promo = moveStr[4] ? `=${moveStr[4].toUpperCase()}` : '';
        const color = colors[i] || '#666666';

        drawMultiPVArrow(from, to, color, i);

        $list.append(`
            <div style="margin:4px 0; padding:6px; background:#2a2926; 
                        border-left:4px solid ${color}; border-radius:4px; font-size:0.9em;">
                <strong>${i + 1}.</strong> 
                ${from.toUpperCase()}→${to.toUpperCase()}${promo}
                <span style="float:right; color:#B58863;">${pv.score}</span>
            </div>
        `);
    });

    saveCurrentEvaluation();
}

function drawMultiPVArrow(fromSquareId, toSquareId, color, index) {
    const svg = document.getElementById('analysis-tree-layer');
    if (!svg) return;

    const fromEl = document.getElementById(fromSquareId);
    const toEl = document.getElementById(toSquareId);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const boardRect = document.querySelector('.chess-board').getBoundingClientRect();

    const offset = (index - 1) * 6;
    const x1 = fromRect.left + fromRect.width / 2 - boardRect.left + offset;
    const y1 = fromRect.top + fromRect.height / 2 - boardRect.top + offset;
    const x2 = toRect.left + toRect.width / 2 - boardRect.left + offset;
    const y2 = toRect.top + toRect.height / 2 - boardRect.top + offset;

    // Linha mais fina
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', index === 0 ? '5' : '4');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', index === 0 ? '0.85' : '0.65');
    svg.appendChild(line);

    // Seta menor
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = index === 0 ? 16 : 14;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = [
        [x2, y2],
        [x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)],
        [x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)]
    ];
    arrow.setAttribute('points', points.map(p => p.join(',')).join(' '));
    arrow.setAttribute('fill', color);
    arrow.setAttribute('opacity', index === 0 ? '0.85' : '0.65');
    svg.appendChild(arrow);

    // Badge retangular pequeno
    const pv = pvData[index];
    if (pv && pv.score) {
        const badgeDistance = 25;
        const badgeX = x2 - badgeDistance * Math.cos(angle);
        const badgeY = y2 - badgeDistance * Math.sin(angle);

        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Retângulo pequeno
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const scoreText = pv.score.replace('+', '').replace('-', ''); // Remove sinais
        const textWidth = scoreText.length * 7 + 6;
        
        rect.setAttribute('x', badgeX - textWidth / 2);
        rect.setAttribute('y', badgeY - 9);
        rect.setAttribute('width', textWidth);
        rect.setAttribute('height', '18');
        rect.setAttribute('rx', '3');
        rect.setAttribute('fill', 'rgba(42, 41, 38, 0.92)');
        rect.setAttribute('stroke', color);
        rect.setAttribute('stroke-width', '1.5');
        badge.appendChild(rect);

        // Texto sem sinal
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', badgeX);
        text.setAttribute('y', badgeY + 4);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#F0D9B5');
        text.textContent = scoreText;
        badge.appendChild(text);

        svg.appendChild(badge);
    }
}

// ===================================
// MOVE QUALITY EVALUATION
// ===================================

function evaluateMoveQuality(prevEval, currEval, color) {
    if (prevEval === null || currEval === null || prevEval === undefined || currEval === undefined) {
        return null;
    }

    const perspective = color === 'b' ? -1 : 1;
    const evalChange = (currEval - prevEval) * perspective;

    if (evalChange >= MOVE_QUALITY.BRILLIANT.threshold) {
        return { ...MOVE_QUALITY.BRILLIANT, change: evalChange };
    } else if (evalChange >= MOVE_QUALITY.GREAT.threshold) {
        return { ...MOVE_QUALITY.GREAT, change: evalChange };
    } else if (evalChange >= MOVE_QUALITY.BEST.threshold) {
        return { ...MOVE_QUALITY.BEST, change: evalChange };
    } else if (evalChange >= MOVE_QUALITY.EXCELLENT.threshold) {
        return { ...MOVE_QUALITY.EXCELLENT, change: evalChange };
    } else if (evalChange >= MOVE_QUALITY.GOOD.threshold) {
        return { ...MOVE_QUALITY.GOOD, change: evalChange };
    } else if (evalChange >= MOVE_QUALITY.INACCURACY.threshold) {
        return { ...MOVE_QUALITY.INACCURACY, change: evalChange };
    } else if (evalChange >= MOVE_QUALITY.MISTAKE.threshold) {
        return { ...MOVE_QUALITY.MISTAKE, change: evalChange };
    } else {
        return { ...MOVE_QUALITY.BLUNDER, change: evalChange };
    }
}

// ===================================
// PGN NAVIGATION
// ===================================

$('#btn-pgn-start').click(function () {
    loadedPgnGame.reset();
    currentMoveIndex = -1;
    updateBoardDisplay();
    updateMoveInfo();
    updateMoveListHighlight(currentMoveIndex);
    clearArrow();
    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
});

$('#btn-pgn-prev').click(async function () {
    if (currentMoveIndex >= 0) {
        // Analisa posição atual antes de voltar
        if (previousEvaluations[currentMoveIndex] === undefined && stockfishReady) {
            const fenCurrent = loadedPgnGame.fen();
            previousEvaluations[currentMoveIndex] = await quickEval(fenCurrent);
        }
        
        var undoneMove = loadedPgnGame.undo();
        currentMoveIndex--;
        updateBoardDisplay();
        updateMoveInfo();
        updateMoveListHighlight(currentMoveIndex);

        if (undoneMove && soundsOn) {
            playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
        }

        clearArrow();
    }
});

$('#btn-pgn-next').click(async function () {
    if (currentMoveIndex < moveHistory.length - 1) {
        
        // Análise ANTES do movimento
        if (previousEvaluations[currentMoveIndex] === undefined && stockfishReady) {
            const fenBefore = loadedPgnGame.fen();
            previousEvaluations[currentMoveIndex] = await quickEval(fenBefore);
        }
        
        // Faz o movimento
        currentMoveIndex++;
        var moveObj = loadedPgnGame.move(moveHistory[currentMoveIndex]);
        updateBoardDisplay();
        updateMoveInfo();
        updateMoveListHighlight(currentMoveIndex);

        if (moveObj) {
            $("#square-clicked").text(moveObj.to.toUpperCase());
            speakSquare(moveObj.san);

            if (soundsOn) {
                if (moveObj.captured) {
                    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3");
                } else {
                    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
                }
            }
        }
        
        // Análise DEPOIS do movimento
        let quality = null;
        
        if (stockfishReady && moveObj) {
            const fenAfter = loadedPgnGame.fen();
            previousEvaluations[currentMoveIndex] = await quickEval(fenAfter);
            
            if (previousEvaluations[currentMoveIndex - 1] !== undefined && 
                previousEvaluations[currentMoveIndex] !== undefined) {
                
                quality = evaluateMoveQuality(
                    previousEvaluations[currentMoveIndex - 1],
                    previousEvaluations[currentMoveIndex],
                    moveObj.color
                );
                
                if (quality) {
                    const $moveSpan = $(`.move-san[data-move-index="${currentMoveIndex}"]`);
                    
                    if ($moveSpan.length > 0) {
                        $moveSpan.attr('data-quality', quality.label);
                        $moveSpan.attr('data-quality-icon', quality.icon);
                        $moveSpan.find('.quality-badge').remove();
                        $moveSpan.append(`<span class="quality-badge" style="color:${quality.color}; font-weight:bold; margin-left:4px;">${quality.icon}</span>`);
                    }
                }
            }
        }
        
        // Desenha seta com badge de qualidade e marca casas
        if (moveObj) {
            drawArrow(moveObj.from, moveObj.to, quality);
            applySquareEffect(moveObj.from, moveObj.to);
        }
    }
});

// Adicione esta função NOVA no game.js
function quickEval(fen) {
    return new Promise((resolve) => {
        let resolved = false;
        const localPvData = [];
        
        const handler = (event) => {
            const line = event.data;
            
            if (line.startsWith('info') && line.includes('score')) {
                const scoreCp = line.match(/score cp (-?\d+)/)?.[1];
                const scoreMate = line.match(/score mate (-?\d+)/)?.[1];
                
                if (scoreCp) {
                    localPvData[0] = { score: (parseInt(scoreCp) / 100).toFixed(2) };
                } else if (scoreMate) {
                    const mate = parseInt(scoreMate);
                    localPvData[0] = { score: mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}` };
                }
            }
            
            if (line.startsWith('bestmove') && !resolved) {
                resolved = true;
                stockfish.removeEventListener('message', handler);
                
                let evalScore = 0;
                if (localPvData[0] && localPvData[0].score) {
                    const score = localPvData[0].score;
                    if (score.startsWith('M') || score.startsWith('-M')) {
                        evalScore = score.includes('-') ? -900 : 900;
                    } else {
                        evalScore = parseFloat(score) * 100;
                    }
                }
                resolve(evalScore);
            }
        };
        
        stockfish.addEventListener('message', handler);
        stockfish.postMessage('stop');
        stockfish.postMessage('position fen ' + fen);
        stockfish.postMessage('go depth 12');
        
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                stockfish.removeEventListener('message', handler);
                resolve(0);
            }
        }, 3000);
    });
}

$('#btn-pgn-end').click(function () {
    loadedPgnGame.load_pgn($('#pgn-input').val().trim());
    currentMoveIndex = moveHistory.length - 1;

    var lastMoveObj = null;
    if (moveHistory.length > 0) {
        var tempGame = new Chess();
        tempGame.load_pgn($('#pgn-input').val().trim());
        lastMoveObj = tempGame.history({ verbose: true }).pop();
    }

    updateBoardDisplay();
    updateMoveInfo();
    updateMoveListHighlight(currentMoveIndex);

    if (lastMoveObj) {
        drawArrow(lastMoveObj.from, lastMoveObj.to);

        if (soundsOn) {
            if (lastMoveObj.captured) {
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3");
            } else {
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
            }
        }
    }
});

function goToMove(index) {
    if (index < -1 || index >= moveHistory.length) return;

    loadedPgnGame.reset();

    for (let i = 0; i <= index; i++) {
        loadedPgnGame.move(moveHistory[i]);
    }

    currentMoveIndex = index;

    updateBoardDisplay();
    updateMoveInfo();
    updateMoveListHighlight(currentMoveIndex);
    clearArrow();
    if (index >= 0) {
        const moveObj = loadedPgnGame.history({ verbose: true })[index];
        applySquareEffect(moveObj.from, moveObj.to);
    }
}

// ===================================
// PGN LOADING
// ===================================

$('#btn-load-pgn').on('click', function() {
    const pgnText = $('#pgn-input').val().trim();

    if (!pgnText) return;

    try {
        loadedPgnGame = new Chess();
        if (loadedPgnGame.load_pgn(pgnText, { sloppy: true })) {
            moveHistory = loadedPgnGame.history();
            const header = loadedPgnGame.header();

            previousEvaluations = {};

            populateMoveList(loadedPgnGame.history({ verbose: true }));
            $('#pgn-score-sheet').show();
            $('#pgn-move-list').scrollTop(0);

            loadedPgnGame.reset();
            currentMoveIndex = -1;
            updateBoardDisplay();
            updateOpeningName();
            updateMoveListHighlight(-1);
            $('.pgn-navigation').show();
            $('#player-white-name').text(`⚪ ${header['White'] || 'Jogador (Brancas)'}`).show();
            $('#player-black-name').text(`⚫ ${header['Black'] || 'Jogador (Pretas)'}`).show();

            const statusHtml = `
                <strong>${header['Event'] || 'Partida Casual'}</strong><br>
                <small>${(header['Site'] || 'Local Desconhecido').split(',')[0]}, ${(header['Date'] || 'Ano Desconhecido').split('.')[0]}</small>
                <hr style="border-color:#4a4946; border-top:0; margin: 8px 0;">
                ⚪ <strong>${header['White'] || 'Jogador (Brancas)'}</strong><br>
                ⚫ <strong>${header['Black'] || 'Jogador (Pretas)'}</strong><br>
                Resultado: <strong>${header['Result'] || '*'}</strong>
                <br>Total de Lances: <strong>${moveHistory.length}</strong>
            `;
            $('#pgn-status').html(statusHtml);

            $('#btn-paste-pgn').text('✏️ Editar PGN').off('click').on('click', function(e) {
                e.preventDefault();
                const novo = prompt("Edite o PGN:", pgnText);
                if (novo && novo !== pgnText) {
                    $('#pgn-input').val(novo);
                    $('#btn-load-pgn').click();
                }
            });

        } else {
            alert("PGN inválido. Verifique o formato.");
        }
    } catch (e) {
        alert("Erro ao processar PGN: " + e.message);
    }
});

$('#btn-paste-pgn').on('click', function(e) {
    e.preventDefault();

    const pgn = prompt("Cole o PGN completo da partida aqui:", "");

    if (pgn && pgn.trim().length > 10) {
        $('#pgn-input').val(pgn.trim());
        $('#btn-load-pgn').click();
    } else if (pgn) {
        alert("PGN muito curto ou inválido. Tente novamente.");
    }
});

// ===================================
// SCORE SHEET
// ===================================

function populateMoveList(history) {
    const $moveList = $('#pgn-move-list').empty().show();
    let $currentRow = null;

    history.forEach((move, index) => {
        const san = move.san;
        const calculatedMoveNumber = Math.floor(index / 2) + 1;

        let qualityAttr = '';
        let iconAttr = '';
        let qualityBadge = '';

        if (previousEvaluations[index] !== undefined && previousEvaluations[index - 1] !== undefined) {
            const quality = evaluateMoveQuality(
                previousEvaluations[index - 1],
                previousEvaluations[index],
                move.color
            );

            if (quality) {
                qualityAttr = `data-quality="${quality.label}"`;
                iconAttr = `data-quality-icon="${quality.icon}"`;
                qualityBadge = `<span style="color:${quality.color}; font-weight:bold; margin-left:4px;">${quality.icon}</span>`;
            }
        }

        if (move.color === 'w') {
            if ($currentRow) $moveList.append($currentRow);
            $currentRow = $('<div class="move-row" style="display:grid; grid-template-columns: 1fr 1fr;"></div>');
            $currentRow.append(`<span class="move-san" data-move-index="${index}" ${qualityAttr} ${iconAttr} style="text-align:left; padding-left:5px;">${calculatedMoveNumber}. ${san}${qualityBadge}</span>`);
        } else {
            if (!$currentRow) {
                $currentRow = $('<div class="move-row" style="display:grid; grid-template-columns: 1fr 1fr;"></div>');
                $currentRow.append(`<span class="move-san" data-move-index="-1" style="text-align:left; padding-left:5px;">${calculatedMoveNumber}. ...</span>`);
            }
            $currentRow.append(`<span class="move-san" data-move-index="${index}" ${qualityAttr} ${iconAttr} style="text-align:left;">${san}${qualityBadge}</span>`);
            $moveList.append($currentRow);
            $currentRow = null;
        }
    });

    if ($currentRow) $moveList.append($currentRow);
}

function updateMoveListHighlight(index) {
    $('.move-san').removeClass('active-move');

    const $activeMove = $(`.move-san[data-move-index="${index}"]`);
    if ($activeMove.length > 0) {
        $activeMove.addClass('active-move');

        const $container = $('#pgn-move-list');
        const containerTop = $container.scrollTop();
        const containerBottom = containerTop + $container.height();
        const moveTop = $activeMove.position().top + containerTop;
        const moveBottom = moveTop + $activeMove.outerHeight();

        if (moveTop < containerTop) {
            $container.scrollTop(moveTop);
        } else if (moveBottom > containerBottom) {
            $container.scrollTop(moveBottom - $container.height() + $activeMove.outerHeight());
        }
    }
}

$('#pgn-move-list').on('click', '.move-san', function() {
    const moveIndex = $(this).data('move-index');

    if (moveIndex !== undefined && moveIndex !== -1) {
        goToMove(parseInt(moveIndex, 10));

        try {
            const moveObj = loadedPgnGame.history({ verbose: true })[moveIndex];
            if (moveObj) {
                $("#square-clicked").text(moveObj.san);
            }
        } catch (e) {}
    }
});

// ===================================
// BOARD DISPLAY
// ===================================

function updateBoardDisplay() {
    $('.chess-square').css('background-image', 'none');

    if (!pieces) {
        $('.chess-square').css('background-size', '0,0');
        return;
    }

    var fen = loadedPgnGame.fen();
    var fenParts = fen.split(' ');
    var position = fenParts[0];

    var pieceImages = {
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

    var ranks = position.split('/');

    for (var i = 0; i < 8; i++) {
        var rank = 8 - i;
        var file = 0;

        for (var j = 0; j < ranks[i].length; j++) {
            var char = ranks[i][j];

            if (!isNaN(char)) {
                file += parseInt(char);
            } else {
                var squareName = String.fromCharCode(97 + file) + rank;
                var imageUrl = pieceImages[char];

                $('#' + squareName).css({
                    'background-image': 'url("' + imageUrl + '")',
                    'background-size': 'contain'
                });

                file++;
            }
        }
    }
}

function updateMoveInfo() {
    if (moveHistory.length === 0) {
        $('#current-move').text('📍 Posição inicial');
        updateOpeningName();
        return;
    }

    var currentMove = currentMoveIndex >= 0 ? moveHistory[currentMoveIndex] : 'Início';
    $('#current-move').html(`<strong>Lance ${currentMoveIndex + 1}/${moveHistory.length}:</strong> ${currentMove}`);
    updateOpeningName();
}

// ===================================
// ARROWS
// ===================================

// SUBSTITUA a função drawArrow() completa:

function drawArrow(fromSquareId, toSquareId, quality = null) {
    const svg = document.getElementById('move-arrow-layer');
    if (!svg) return;

    svg.innerHTML = '';

    const fromEl = document.getElementById(fromSquareId);
    const toEl = document.getElementById(toSquareId);

    if (!fromEl || !toEl) return;

    // Remove marcações antigas
    $('.chess-square').removeClass('square-highlight-from square-highlight-to');
    
    // Marca as casas (estilo Chess.com)
    fromEl.classList.add('square-highlight-from');
    toEl.classList.add('square-highlight-to');

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const boardRect = document.querySelector('.chess-board').getBoundingClientRect();

    const x1 = fromRect.left + fromRect.width / 2 - boardRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - boardRect.top;
    const x2 = toRect.left + toRect.width / 2 - boardRect.left;
    const y2 = toRect.top + toRect.height / 2 - boardRect.top;

    // Define cor da seta baseada na qualidade
    let arrowColor = '#4CAF50'; // Verde padrão
    
    if (quality) {
        arrowColor = quality.color;
    }

    // Linha da seta
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', arrowColor);
    line.setAttribute('stroke-width', '6');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.85');
    svg.appendChild(line);

    // Ponta da seta
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 20;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = [
        [x2, y2],
        [x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)],
        [x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)]
    ];
    arrow.setAttribute('points', points.map(p => p.join(',')).join(' '));
    arrow.setAttribute('fill', arrowColor);
    arrow.setAttribute('opacity', '0.85');
    svg.appendChild(arrow);

    // Badge de qualidade na ponta da seta (estilo Chess.com)
    if (quality && quality.icon) {
        const badgeDistance = 40;
        const badgeX = x2 - badgeDistance * Math.cos(angle);
        const badgeY = y2 - badgeDistance * Math.sin(angle);

        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Círculo de fundo
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', badgeX);
        circle.setAttribute('cy', badgeY);
        circle.setAttribute('r', '18');
        circle.setAttribute('fill', quality.color);
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '3');
        badge.appendChild(circle);

        // Ícone
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', badgeX);
        text.setAttribute('y', badgeY + 6);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '18');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#ffffff');
        text.textContent = quality.icon;
        badge.appendChild(text);

        svg.appendChild(badge);
    }

    svg.style.display = 'block';
}

function clearArrow() {
    const svg = document.getElementById('move-arrow-layer');
    if (svg) {
        svg.innerHTML = '';
        svg.style.display = 'none';
    }
    $('.chess-square').removeClass('square-highlight-from square-highlight-to');
}

// ===================================
// OPENING BOOK
// ===================================

function updateOpeningName() {
    const $openingNameEl = $('#opening-name');
    const $historyBoxEl = $('#opening-history-box');
    const $historyTextEl = $('#opening-history-text');

    if (!OPENING_BOOK) {
        $openingNameEl.text("");
        $historyBoxEl.hide();
        return;
    }

    var historySlice = moveHistory.slice(0, currentMoveIndex + 1);
    var openingMatch = null;

    for (var i = historySlice.length; i > 0; i--) {
        var moveKey = historySlice.slice(0, i).join(' ');
        if (OPENING_BOOK[moveKey]) {
            openingMatch = OPENING_BOOK[moveKey];
            break;
        }
    }

    if (openingMatch && openingMatch.name) {
        const englishName = openingMatch.name;
        const eco = openingMatch.eco;
        let infoIcon = "";
        let historia = "";
        let nomePt = "";

        if (typeof OPENING_DETAILS_PT !== 'undefined' && OPENING_DETAILS_PT[englishName]) {
            const details = OPENING_DETAILS_PT[englishName];
            nomePt = details.nome;
            historia = details.historia;

            infoIcon = ' <span id="opening-info-icon" title="Clique para saber mais">ℹ</span>';
            $historyTextEl.text(historia);
            $historyBoxEl.find('h5').text("Sobre: " + nomePt);
        } else {
            nomePt = englishName;
            $historyBoxEl.hide();
        }

        $openingNameEl.html(`${nomePt} <span class="eco-code">(${eco})</span>${infoIcon}`);
    } else {
        $openingNameEl.text("");
        $historyBoxEl.hide();
    }
}

function loadOpeningBook() {
    $.getJSON("openings.json")
        .done(function(data) {
            OPENING_BOOK = data;
            console.log("✅ Livro de aberturas carregado!");
            updateOpeningName();
        })
        .fail(function(jqxhr, textStatus, error) {
            console.error("❌ Erro ao carregar openings.json: " + textStatus + ", " + error);
        });
}

// ===================================
// PRELOADED GAMES
// ===================================

$('#btn-load-preloaded').on('click', function () {
    const $btn = $(this);
    const $status = $('#preloaded-status');
    const $selectsContainer = $('#preloaded-selects');
    const $nezSelect = $('#select-nez-game');
    const $thalSelect = $('#select-thal-game');

    if ($btn.prop('disabled')) return;

    $btn.prop('disabled', true).text('Carregando...');
    $status.html('Carregando nez.pgn e thal.pgn...').css('color', '#ffaa00');
    $selectsContainer.hide();

    $nezSelect.empty().append('<option value="">Carregando Nezhmetdinov...</option>');
    $thalSelect.empty().append('<option value="">Carregando Tal...</option>');

    let loaded = 0;
    const total = 2;

    function checkDone() {
        loaded++;
        if (loaded === total) {
            $btn.prop('disabled', false).text('Recarregar Partidas');
            $selectsContainer.show();
            $status.html('Partidas carregadas com sucesso!').css('color', '#00ff00');
        }
    }

    fetch('nez.pgn')
        .then(r => {
            if (!r.ok) throw new Error(`nez.pgn não encontrado (404)`);
            return r.text();
        })
        .then(text => {
            populateSelect(text, $nezSelect, 'Nezhmetdinov');
            checkDone();
        })
        .catch(err => {
            $nezSelect.empty().append('<option value="">Erro: ' + err.message + '</option>');
            $status.html('Erro ao carregar nez.pgn').css('color', '#ff0000');
            checkDone();
        });

    fetch('thal.pgn')
        .then(r => {
            if (!r.ok) throw new Error(`thal.pgn não encontrado (404)`);
            return r.text();
        })
        .then(text => {
            populateSelect(text, $thalSelect, 'Tal');
            checkDone();
        })
        .catch(err => {
            $thalSelect.empty().append('<option value="">Erro: ' + err.message + '</option>');
            $status.html('Erro ao carregar thal.pgn').css('color', '#ff0000');
            checkDone();
        });
});

function populateSelect(pgnText, $select, playerName) {
    $select.empty().append('<option value="">Selecione uma partida de ' + playerName + '...</option>');

    const games = pgnText.split(/\n\s*\n(?=\[Event)/).filter(g => g.trim().startsWith('[Event'));

    if (games.length === 0) {
        $select.append('<option value="">Nenhuma partida encontrada</option>');
        return;
    }

    games.forEach((pgn, i) => {
        const white = pgn.match(/\[White "([^"]+)"\]/)?.[1] || 'Brancas';
        const black = pgn.match(/\[Black "([^"]+)"\]/)?.[1] || 'Pretas';
        const date = pgn.match(/\[Date "([^"]+)"\]/)?.[1]?.split('.')[0] || '';
        const name = `${white} vs ${black}${date ? ' (' + date + ')' : ''}`;

        $select.append(`<option value="${pgn.replace(/"/g, '&quot;')}">${name}</option>`);
    });
}

$('#select-nez-game, #select-thal-game').on('change', function () {
    const pgn = $(this).val();
    if (pgn) {
        $('#pgn-input').val(pgn);
        $('#btn-load-pgn').click();
    }
});

// ===================================
// VOICE SYNTHESIS
// ===================================

let availableVoices = [];
let selectedVoiceIndex = null;

function populateVoiceList() {
    if (!('speechSynthesis' in window)) {
        $('#voice-select').html('<option value="">Speech não suportado</option>');
        return;
    }

    const synth = window.speechSynthesis;
    availableVoices = synth.getVoices().filter(v => v.lang.includes('pt') || v.lang.includes('en'));

    const $select = $('#voice-select');
    $select.empty();

    if (availableVoices.length === 0) {
        $select.append('<option value="">Nenhuma voz encontrada</option>');
        return;
    }

    $select.append('<option value="">Voz padrão do navegador</option>');

    availableVoices.forEach((voice, index) => {
        const isDefault = voice.default ? ' (Padrão)' : '';
        $select.append(`<option value="${index}">${voice.name} (${voice.lang})${isDefault}</option>`);
    });

    const preferredIndex = availableVoices.findIndex(v => v.lang === 'pt-BR' && (v.name.includes('Luciana') || v.name.includes('Google')));
    if (preferredIndex !== -1) {
        $select.val(preferredIndex);
        selectedVoiceIndex = preferredIndex;
    }
}

$('#voice-select').on('change', function () {
    selectedVoiceIndex = $(this).val() === "" ? null : parseInt($(this).val());
});

function speakSquare(squareText) {
    try {
        if (!soundsOn) return;

        if ('speechSynthesis' in window) {
            const synth = window.speechSynthesis;
            const utterance = new SpeechSynthesisUtterance(squareText);
            utterance.lang = 'pt-BR';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            if (selectedVoiceIndex !== null && availableVoices[selectedVoiceIndex]) {
                utterance.voice = availableVoices[selectedVoiceIndex];
            }

            speechSynthesis.speak(utterance);
        }
    } catch (e) {
        console.error('Erro ao falar casa:', e);
    }
}

if ('speechSynthesis' in window) {
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
        populateVoiceList();
    } else {
        synth.onvoiceschanged = populateVoiceList;
    }
}

// ===================================
// GAME BUTTONS
// ===================================

$(".btn-play-pause").click(function () {
    if ($(this).hasClass("paused")) {
        resetTimer(timeLimit);
        playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3");
    } else {
        startTimer();
        playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-start.mp3");
        $("#square-random").text(randomSquare());
    }
    $(this).toggleClass("paused");
});

$(".chess-square").click(function () {
    var rndm = $("#square-random").text();
    var click = $(this).attr('id');
    $("#square-clicked").text(click);
    if (soundsOn) {
        if (rndm === "-") {
            $("#img-answer-right").addClass("hidden");
            $("#img-answer-wrong").addClass("hidden");
        } else if (click === rndm) {
            hits++;
            $("#square-score").text(hits);
            playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
            $("#square-random").text(randomSquare());
            $("#img-answer-right").removeClass("hidden");
            $("#img-answer-wrong").addClass("hidden");
        } else {
            resetTimer(0);
            playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/illegal.mp3");
            $("#img-answer-right").addClass("hidden");
            $("#img-answer-wrong").removeClass("hidden");
        }
    }
});

// ===================================
// SETTINGS BUTTONS
// ===================================

$("#btn-timer").click(function () {
    var time = prompt("Alterar limite de tempo (em segundos):", "30");
    if (isInt(time)) {
        timeLimit = parseInt(time);
        resetTimer(timeLimit);
    }
});

$("#btn-squarenames").click(function () {
    $(".notation").toggleClass('hidden');
    squarenames = !squarenames;
    $(this).text(squarenames ? "Esconder nome das casas" : "Mostrar nome das casas");
});

$("#btn-pieces").click(function () {
    pieces = !pieces;
    if (pieces) {
        updateBoardDisplay();
        $(this).text("Esconder peças");
    } else {
        $(".chess-square").css('background-size', '0,0');
        $(this).text("Mostrar peças");
    }
});

$("#btn-reverse").click(function () {
    reverse = !reverse;
    if (reverse) {
        $(".chess-board").css('flex-direction', 'column');
        $(".chess-row").css('flex-direction', 'row');
        $(this).text("Pretas embaixo");
    } else {
        $(".chess-board").css('flex-direction', 'column-reverse');
        $(".chess-row").css('flex-direction', 'row-reverse');
        $(this).text("Brancas embaixo");
    }
});

// ===================================
// ANALYSIS BUTTONS
// ===================================

$('#btn-analyze').off('click').on('click', function() {
    if (!stockfishReady) {
        alert('Engine ainda não está pronto. Aguarde.');
        return;
    }

    if (isAnalyzing) {
        stopAnalysis();
    } else {
        analyzePosition();
    }
});

$('#btn-visual-analysis').off('click').on('click', function () {
    if (!stockfishReady) {
        alert('Engine ainda não está pronto. Aguarde.');
        return;
    }

    const isActive = $(this).text().includes('Desativar');

    if (isActive) {
        $(this).text('🌳 Análise Visual (Multi-PV)');
        stopAnalysis();

        const svg = document.getElementById('analysis-tree-layer');
        if (svg) {
            svg.innerHTML = '';
            svg.style.display = 'none';
        }
        pvData = [];
        $('#multi-pv-list').empty();
    } else {
        $(this).text('Desativar Análise Visual');
        analyzePosition();
    }
});

$('#btn-pgn-prev, #btn-pgn-next, #btn-pgn-start, #btn-pgn-end').click(function() {
    const svg = document.getElementById('analysis-tree-layer');
    if (svg) {
        svg.innerHTML = '';
        svg.style.display = 'none';
    }
    pvData = [];
});

// ===================================
// UTILITY FUNCTIONS
// ===================================

function randomSquare() {
    var randomNumber = Math.floor(Math.random() * 64);
    var col = Math.floor(randomNumber / 8);
    var row = randomNumber % 8 + 1;
    var square = String.fromCharCode(97 + col) + row;
    return square;
}

function playSound(name) {
    try {
        var audio = new Audio(name);
        audio.play().catch(e => console.log('Som desabilitado:', e));
    } catch (e) {
        console.log('Erro ao tocar som');
    }
}

function isInt(value) {
    return !isNaN(value) &&
        parseInt(Number(value)) == value &&
        !isNaN(parseInt(value, 10));
}

// ===================================
// TIMER FUNCTIONS
// ===================================

const FULL_DASH_ARRAY = 283;
const WARNING_THRESHOLD = 10;
const ALERT_THRESHOLD = 5;

const COLOR_CODES = {
    info: { color: "green" },
    warning: { color: "orange", threshold: WARNING_THRESHOLD },
    alert: { color: "red", threshold: ALERT_THRESHOLD }
};

var remainingPathColor = COLOR_CODES.info.color;

$("#timer").html(`
<div class="base-timer">
  <svg class="base-timer__svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g class="base-timer__circle">
      <circle class="base-timer__path-elapsed" cx="50" cy="50" r="45"></circle>
      <path
        id="base-timer-path-remaining"
        stroke-dasharray="283"
        class="base-timer__path-remaining ${remainingPathColor}"
        d="
          M 50, 50
          m -45, 0
          a 45,45 0 1,0 90,0
          a 45,45 0 1,0 -90,0
        "
      ></path>
    </g>
  </svg>
  <span id="base-timer-label" class="base-timer__label">${formatTime(timeLeft)}</span>
</div>
`);

function onTimesUp() {
    $("#square-random").text("-");
    $("#square-score").text(hits);
    clearInterval(timerInterval);
}

function startTimer() {
    timerInterval = setInterval(() => {
        timePassed += 1;
        timeLeft = timeLimit - timePassed;
        $("#base-timer-label").html(formatTime(timeLeft));
        setCircleDasharray();
        setRemainingPathColor(timeLeft);
        if (timeLeft === 10) {
            playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/tenseconds.mp3");
        }
        if (timeLeft === 0) {
            playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3");
            onTimesUp();
        }
    }, 1000);
}

function formatTime(time) {
    const minutes = Math.floor(time / 60);
    let seconds = time % 60;
    if (seconds < 10) {
        seconds = `0${seconds}`;
    }
    return `${minutes}:${seconds}`;
}

function setRemainingPathColor(timeLeft) {
    const { alert, warning, info } = COLOR_CODES;
    if (timeLeft <= alert.threshold) {
        $("#base-timer-path-remaining").removeClass(COLOR_CODES.info.color);
        $("#base-timer-path-remaining").removeClass(COLOR_CODES.warning.color);
        $("#base-timer-path-remaining").addClass(COLOR_CODES.alert.color);
    } else if (timeLeft <= warning.threshold) {
        $("#base-timer-path-remaining").removeClass(COLOR_CODES.info.color);
        $("#base-timer-path-remaining").addClass(COLOR_CODES.warning.color);
        $("#base-timer-path-remaining").removeClass(COLOR_CODES.alert.color);
    } else {
        $("#base-timer-path-remaining").addClass(COLOR_CODES.info.color);
        $("#base-timer-path-remaining").removeClass(COLOR_CODES.warning.color);
        $("#base-timer-path-remaining").removeClass(COLOR_CODES.alert.color);
    }
}

function calculateTimeFraction() {
    const rawTimeFraction = timeLeft / timeLimit;
    return rawTimeFraction - (1 / timeLimit) * (1 - rawTimeFraction);
}

function setCircleDasharray() {
    const circleDasharray = `${(
        calculateTimeFraction() * FULL_DASH_ARRAY
    ).toFixed(0)} 283`;
    document
        .getElementById("base-timer-path-remaining")
        .setAttribute("stroke-dasharray", circleDasharray);
}

function resetTimer(timeReset) {
    $("#square-score").text(hits);
    hits = 0;
    $("#square-random").text("-");
    clearInterval(timerInterval);
    timePassed = 0;
    timeLeft = timeReset - timePassed;
    $("#base-timer-label").html(formatTime(timeLeft));
    setCircleDasharray();
    setRemainingPathColor(timeLeft);
}

// ===================================
// INITIALIZATION
// ===================================

$(document).ready(function() {
    loadOpeningBook();
    initStockfish();

   const checkStockfish = setInterval(() => {
        if (stockfish && stockfishReady) {
            clearInterval(checkStockfish);
            PlayVsStockfish.init(stockfish);
            console.log('🎮 Módulo de jogo conectado ao Stockfish');
        }
    }, 500);

    $('#pgn-move-list').on('click', '.move-san', function() {
        const moveIndex = $(this).data('move-index');

        if (moveIndex !== undefined && moveIndex !== -1) {
            goToMove(parseInt(moveIndex, 10));

            try {
                const moveObj = loadedPgnGame.history({ verbose: true })[moveIndex];
                if (moveObj) {
                    $("#square-clicked").text(moveObj.san);
                }
            } catch (e) {}
        }
    });

    $('#opening-name').on('click', '#opening-info-icon', function(e) {
        e.stopPropagation();
        $('#opening-history-box').slideToggle(200);
    });
});

function populateMoveList(history) {
    const $moveList = $('#pgn-move-list').empty().show();
    let $currentRow = null;

    history.forEach((move, index) => {
        const san = move.san;
        const calculatedMoveNumber = Math.floor(index / 2) + 1;

        let qualityAttr = '';
        let iconAttr = '';
        let qualityBadge = '';

        if (previousEvaluations[index] !== undefined && previousEvaluations[index - 1] !== undefined) {
            const quality = evaluateMoveQuality(
                previousEvaluations[index - 1],
                previousEvaluations[index],
                move.color
            );

            if (quality) {
                qualityAttr = `data-quality="${quality.label}"`;
                iconAttr = `data-quality-icon="${quality.icon}"`;
                qualityBadge = `<span style="color:${quality.color}; font-weight:bold; margin-left:4px;">${quality.icon}</span>`;
            }
        }

        if (move.color === 'w') {
            if ($currentRow) $moveList.append($currentRow);
            $currentRow = $('<div class="move-row" style="display:grid; grid-template-columns: 1fr 1fr;"></div>');
            $currentRow.append(`<span class="move-san" data-move-index="${index}" ${qualityAttr} ${iconAttr} style="text-align:left; padding-left:5px;">${calculatedMoveNumber}. ${san}${qualityBadge}</span>`);
        } else {
            if (!$currentRow) {
                $currentRow = $('<div class="move-row" style="display:grid; grid-template-columns: 1fr 1fr;"></div>');
                $currentRow.append(`<span class="move-san" data-move-index="-1" style="text-align:left; padding-left:5px;">${calculatedMoveNumber}. ...</span>`);
            }
            $currentRow.append(`<span class="move-san" data-move-index="${index}" ${qualityAttr} ${iconAttr} style="text-align:left;">${san}${qualityBadge}</span>`);
            $moveList.append($currentRow);
            $currentRow = null;
        }
    });

    if ($currentRow) $moveList.append($currentRow);
}

function applySquareEffect(fromSquare, toSquare) {
    // Remove efeitos anteriores
    $('.chess-square').removeClass('square-move-origin square-move-destination square-move-effect');
    
    // Aplica efeito na origem
    setTimeout(() => {
        $(`#${fromSquare}`).addClass('square-move-origin');
        
        // Remove após animação
        setTimeout(() => {
            $(`#${fromSquare}`).removeClass('square-move-origin');
        }, 500);
    }, 10);
    
    // Aplica efeito no destino (com delay)
    setTimeout(() => {
        $(`#${toSquare}`).addClass('square-move-destination');
        
        // Remove após animação
        setTimeout(() => {
            $(`#${toSquare}`).removeClass('square-move-destination');
        }, 900);
    }, 300);
}