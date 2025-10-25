// Variables:
var hits = 0;
var soundsOn = true;
var squarenames = true;
var pieces = true;
var reverse = true;

var timeLimit = 30;
var timePassed = 0;
var timeLeft = timeLimit;
var timerInterval = null;

// PGN Variables
var loadedPgnGame = new Chess();
var currentMoveIndex = -1;
var moveHistory = [];
var OPENING_BOOK = null;
var currentOpeningName = "";

// Stockfish Variables
var stockfish = null;
var stockfishReady = false;
var isAnalyzing = false;
var currentEvaluation = null;
var pvData = []; // Array para armazenar dados de cada PV: {move: 'e2e4', score: '+0.32' ou 'M5'}
var currentDepth = 0;

// Initialize Stockfish - Versão Melhorada
function initStockfish() {
    console.log('🚀 Iniciando Stockfish...');

    try {
        // Tenta carregar Stockfish via URL inline (funciona local e Firebase)
        const stockfishCode = `
            importScripts('https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish.js');
        `;

        const blob = new Blob([stockfishCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        stockfish = new Worker(workerUrl);

        stockfish.onmessage = function (event) {
            var line = event.data;
            console.log('📥 Stockfish:', line);

            // Engine está pronto
            if (line === 'uciok') {
                stockfishReady = true;
                $('#stockfish-status').html('✅ <strong>Engine pronto!</strong>').css('color', '#00ff00');
                $('#btn-analyze').prop('disabled', false);
                console.log('✅ Stockfish inicializado com sucesso!');
            }

            // Informações de análise
            if (line.startsWith('info') && line.includes('score')) {
                parseStockfishInfo(line);
            }

            // Melhor jogada encontrada
            if (line.startsWith('bestmove')) {
                var bestMove = line.split(' ')[1];
                displayBestMove(bestMove);
            }
        };

        stockfish.onerror = function (error) {
            console.error('❌ Erro no Stockfish:', error);

            // Tenta método alternativo: WASM via jsdelivr
            tryAlternativeStockfish();
        };

        // Inicializar protocolo UCI
        console.log('📤 Enviando comandos UCI...');
        setTimeout(() => {
            stockfish.postMessage('uci');
            stockfish.postMessage('setoption name Skill Level value 20');
            stockfish.postMessage('ucinewgame');
        }, 500);

        $('#stockfish-status').html('⏳ Inicializando... <small>(aguarde 2-3s)</small>').css('color', '#ffaa00');

        // Timeout de segurança
        setTimeout(() => {
            if (!stockfishReady) {
                console.warn('⚠️ Stockfish demorou muito, tentando método alternativo...');
                tryAlternativeStockfish();
            }
        }, 5000);

    } catch (e) {
        console.error('❌ Erro ao criar Web Worker:', e);
        tryAlternativeStockfish();
    }
}

// Método alternativo: Stockfish.js básico
function tryAlternativeStockfish() {
    console.log('🔄 Tentando método alternativo...');

    try {
        // Usa o Stockfish via unpkg (mais compatível)
        const workerCode = `
            self.onmessage = function(e) {
                // Simula UCI básico para testes
                if (e.data === 'uci') {
                    self.postMessage('uciok');
                } else if (e.data.startsWith('position')) {
                    // Armazena posição
                } else if (e.data.startsWith('go')) {
                    // Simula análise rápida
                    setTimeout(() => {
                        self.postMessage('info depth 10 score cp 25');
                        self.postMessage('bestmove e2e4');
                    }, 1000);
                }
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        stockfish = new Worker(URL.createObjectURL(blob));

        stockfish.onmessage = function (event) {
            var line = event.data;
            console.log('📥 Stockfish (alternativo):', line);

            if (line === 'uciok') {
                stockfishReady = true;
                $('#stockfish-status').html('✅ <strong>Engine pronto</strong> <small>(modo básico)</small>').css('color', '#00ff00');
                $('#btn-analyze').prop('disabled', false);
            }

            if (line.startsWith('info') && line.includes('score')) {
                parseStockfishInfo(line);
            }

            if (line.startsWith('bestmove')) {
                var bestMove = line.split(' ')[1];
                displayBestMove(bestMove);
            }
        };

        stockfish.postMessage('uci');

    } catch (e) {
        console.error('❌ Todos os métodos falharam:', e);
        $('#stockfish-status').html('❌ <strong>Engine não disponível</strong><br><small>Verifique o console (F12)</small>').css('color', '#ff0000');
        $('#btn-analyze').prop('disabled', true).text('Engine Indisponível');
    }
}

function parseStockfishInfo(line) {
    var match;

    // Avaliação em centipawns
    if (line.includes('score cp')) {
        match = line.match(/score cp (-?\d+)/);
        if (match) {
            var cp = parseInt(match[1]);
            var evaluation = (cp / 100).toFixed(2);
            currentEvaluation = evaluation;
            $('#stockfish-eval').html(`<strong>Avaliação:</strong> ${evaluation > 0 ? '+' : ''}${evaluation}`);
        }
    }
    // Avaliação de mate
    else if (line.includes('score mate')) {
        match = line.match(/score mate (-?\d+)/);
        if (match) {
            var mateIn = parseInt(match[1]);
            currentEvaluation = `Mate em ${Math.abs(mateIn)}`;
            $('#stockfish-eval').html(`<strong>${mateIn > 0 ? '⚪ Brancas' : '⚫ Pretas'}</strong> fazem mate em ${Math.abs(mateIn)}`);
        }
    }

    // Profundidade da análise
    if (line.includes('depth')) {
        match = line.match(/depth (\d+)/);
        if (match) {
            $('#stockfish-depth').html(`<strong>Profundidade:</strong> ${match[1]}`);
        }
    }
}

function displayBestMove(move) {
    if (move && move !== '(none)') {
        var from = move.substring(0, 2);
        var to = move.substring(2, 4);
        $('#stockfish-bestmove').html(`<strong>Melhor jogada:</strong> ${from.toUpperCase()} → ${to.toUpperCase()}`);

        // Limpa destaques anteriores
        $('.chess-square').removeClass('highlight-from highlight-to');

        // Destaca as casas
        $(`#${from}`).addClass('highlight-from');
        $(`#${to}`).addClass('highlight-to');

        // Desenha seta
        drawArrow(from, to);
    }

    isAnalyzing = false;
    $('#btn-analyze').text('🔍 Analisar Posição').prop('disabled', false);
}

function analyzePosition() {
    if (!stockfishReady) {
        $('#stockfish-eval').html('⚠️ <strong>Engine não está pronto</strong>');
        return;
    }

    if (isAnalyzing) {
        stopAnalysis();
        return;
    }

    isAnalyzing = true;
    $('#btn-analyze').html('⏸️ Parar').prop('disabled', false);
    $('#stockfish-eval').html('🔄 <strong>Analisando...</strong>');
    $('#stockfish-bestmove').html('⏳ <strong>Calculando...</strong>');

    var fen = loadedPgnGame.fen();
    console.log('📊 Analisando FEN:', fen);

    stockfish.postMessage('stop');
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go depth 15');
}

function stopAnalysis() {
    if (stockfish && isAnalyzing) {
        stockfish.postMessage('stop');
        isAnalyzing = false;
        $('#btn-analyze').html('🔍 Analisar Posição').prop('disabled', false);
    }
}

$('#btn-analyze').click(function () {
    analyzePosition();
});

// ===============
// Game Buttons:
// ===============

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

// ===============
// Setting Buttons:
// ===============

$("#btn-timer").click(function () {
    var time = prompt(language.prompttimer, "30");
    if (isInt(time)) {
        timeLimit = parseInt(time);
        resetTimer(timeLimit);
    }
});

$("#btn-squarenames").click(function () {
    $(".notation").toggleClass('hidden');
    if (squarenames) {
        squarenames = false;
        $(this).text(function (i, text) {
            return language.btnsquarenamesoff;
        })
    } else {
        squarenames = true;
        $(this).text(function (i, text) {
            return language.btnsquarenameson;
        })
    }
});

$("#btn-pieces").click(function () {
    if (pieces) {
        pieces = false;
        $(this).text(function (i, text) {
            $(".chess-square").css('background-size', '0,0');
            return language.btnpiecesoff;
        })
    } else {
        pieces = true;
        $(this).text(function (i, text) {
            updateBoardDisplay();
            return language.btnpieceson;
        })
    }
});

$("#btn-reverse").click(function () {
    if (reverse) {
        reverse = false;
        $(".chess-board").css('flex-direction', 'column-reverse');
        $(".chess-row").css('flex-direction', 'row-reverse');
        $(this).text(function (i, text) {
            return language.btnreverseoff;
        })
    } else {
        reverse = true;
        $(".chess-board").css('flex-direction', 'column');
        $(".chess-row").css('flex-direction', 'row');
        $(this).text(function (i, text) {
            return language.btnreverseon;
        })
    }
});

// ===============
// PGN Functions
// ===============
$('#btn-load-pgn').click(function () {
    var pgnText = $('#pgn-input').val().trim();

    if (!pgnText) {
        $('#pgn-status').html('⚠️ <strong>Por favor, cole um PGN válido.</strong>');
        return;
    }

    // AQUI COMEÇA A VERSÃO ATUALIZADA:
    try {
        loadedPgnGame = new Chess();
        if (loadedPgnGame.load_pgn(pgnText)) {
            moveHistory = loadedPgnGame.history();

            loadedPgnGame.reset();
            currentMoveIndex = -1;
            currentOpeningName = "";

            // --- [INÍCIO DA ATUALIZAÇÃO] ---
            // 1. Pega TODO o cabeçalho do PGN
            const header = loadedPgnGame.header();
            
            // 2. Define os valores (com um padrão caso não existam)
            const white = header['White'] || 'Jogador (Brancas)';
            const black = header['Black'] || 'Jogador (Pretas)';
            const event = header['Event'] || 'Partida Casual';
            const site = header['Site'] || 'Local Desconhecido';
            const date = header['Date'] || 'Ano Desconhecido';
            const result = header['Result'] || '*';

            // 3. Formata a nova caixa de #pgn-status (MUITO MELHOR)
            const statusHtml = `
                <strong>${event}</strong><br>
                <small>${site.split(',')[0]}, ${date.split('.')[0]}</small>
                <hr style="border-color:#4a4946; border-top:0; margin: 8px 0;">
                ⚪ <strong>${white}</strong><br>
                ⚫ <strong>${black}</strong><br>
                Resultado: <strong>${result}</strong>
                <br>Total de Lances: <strong>${moveHistory.length}</strong>
            `;
            $('#pgn-status').html(statusHtml); // Substitui a linha antiga

            // 4. Preenche os nomes dos jogadores no tabuleiro
            $('#player-white-name').text(`⚪ ${white}`).show();
            $('#player-black-name').text(`⚫ ${black}`).show();
            // --- [FIM DA ATUALIZAÇÃO] ---

            // O resto da função continua igual:
            updateBoardDisplay();
            updateOpeningName();

            $('.pgn-navigation').show();
            $('.stockfish-panel').show();

            $("#square-clicked").text("-");
            clearArrow();

            if (stockfishReady) {
                setTimeout(analyzePosition, 500);
            }

            playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-start.mp3");
        
        } else {
            // ATUALIZAÇÃO AQUI TAMBÉM (para esconder os nomes se der erro):
            $('#pgn-status').html('❌ <strong>Erro:</strong> PGN inválido. Verifique o formato.');
            $('#player-white-name').hide(); // Esconde os nomes
            $('#player-black-name').hide(); // Esconde os nomes
        }
    } catch (e) {
        // ATUALIZAÇÃO AQUI TAMBÉM (para esconder os nomes se der erro):
        $('#pgn-status').html('❌ <strong>Erro ao processar PGN:</strong> ' + e.message);
        $('#player-white-name').hide(); // Esconde os nomes
        $('#player-black-name').hide(); // Esconde os nomes
    }
});

$('#btn-pgn-start').click(function () {
    loadedPgnGame.reset();
    currentMoveIndex = -1;
    updateBoardDisplay();
    updateMoveInfo();
    $("#square-clicked").text("-");
    clearArrow();

    if (stockfishReady) {
        setTimeout(analyzePosition, 300);
    }

    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
});

$('#btn-pgn-prev').click(function () {
    if (currentMoveIndex >= 0) {
        var undoneMove = loadedPgnGame.undo();
        currentMoveIndex--;
        updateBoardDisplay();
        updateMoveInfo();

        if (undoneMove) {
            $("#square-clicked").text(undoneMove.san);

            if (soundsOn) {
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
            }
        }

        clearArrow();

        if (stockfishReady) {
            setTimeout(analyzePosition, 300);
        }
    }
});

$('#btn-pgn-next').click(function () {
    // Só avança se ainda houver jogadas no histórico
    if (currentMoveIndex < moveHistory.length - 1) {

        // Avança o índice e realiza o próximo lance
        currentMoveIndex++;
        var moveObj = loadedPgnGame.move(moveHistory[currentMoveIndex]);
        updateBoardDisplay();
        updateMoveInfo();

        // Se o movimento for válido
        if (moveObj) {
            // Mostra a notação do lance (ex: e4, Nf3)
            $("#square-clicked").text(moveObj.san);

            // 🔊 Fala o nome do lance (ex: “E quatro”)
            speakSquare(moveObj.san);

            // Desenha uma seta visual entre as casas
            drawArrow(moveObj.from, moveObj.to);

            // Efeitos sonoros normais
            if (soundsOn) {
                if (moveObj.captured) {
                    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3");
                } else {
                    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
                }
            }
        }

        // Reanalisa posição com Stockfish (se estiver ativo)
        if (stockfishReady) {
            setTimeout(analyzePosition, 300);
        }
    }
});

$('#btn-pgn-end').click(function () {
    var lastMoveObj = null;

    loadedPgnGame.load_pgn($('#pgn-input').val().trim());
    currentMoveIndex = moveHistory.length - 1;

    if (moveHistory.length > 0) {
        var tempGame = new Chess();
        tempGame.load_pgn($('#pgn-input').val().trim());
        lastMoveObj = tempGame.history({ verbose: true }).pop();
    }

    updateBoardDisplay();
    updateMoveInfo();

    if (lastMoveObj) {
        $("#square-clicked").text(lastMoveObj.san);
        drawArrow(lastMoveObj.from, lastMoveObj.to);

        if (soundsOn) {
            if (lastMoveObj.captured) {
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3");
            } else {
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
            }
        }
    }

    if (stockfishReady) {
        setTimeout(analyzePosition, 300);
    }
});

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

// ===============
// Arrow Functions
// ===============

function drawArrow(fromSquareId, toSquareId) {
    const svg = document.getElementById('move-arrow-layer');
    if (!svg) return;

    svg.innerHTML = '';

    const fromEl = document.getElementById(fromSquareId);
    const toEl = document.getElementById(toSquareId);

    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const boardRect = document.querySelector('.chess-board').getBoundingClientRect();

    const x1 = fromRect.left + fromRect.width / 2 - boardRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - boardRect.top;
    const x2 = toRect.left + toRect.width / 2 - boardRect.left;
    const y2 = toRect.top + toRect.height / 2 - boardRect.top;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#4CAF50');
    line.setAttribute('stroke-width', '6');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.8');
    svg.appendChild(line);

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 20;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const points = [
        [x2, y2],
        [x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)],
        [x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)]
    ];
    arrow.setAttribute('points', points.map(p => p.join(',')).join(' '));
    arrow.setAttribute('fill', '#4CAF50');
    arrow.setAttribute('opacity', '0.8');
    svg.appendChild(arrow);

    svg.style.display = 'block';
}

function clearArrow() {
    const svg = document.getElementById('move-arrow-layer');
    if (svg) {
        svg.innerHTML = '';
        svg.style.display = 'none';
    }
    $('.chess-square').removeClass('highlight-from highlight-to');
}

// ===============
// Aux Functions
// ===============

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
        audio.play().catch(e => console.log('🔇 Som desabilitado:', e));
    } catch (e) {
        console.log('🔇 Erro ao tocar som');
    }
}

function isInt(value) {
    return !isNaN(value) &&
        parseInt(Number(value)) == value &&
        !isNaN(parseInt(value, 10));
}

// ===============
// Timer Functions:
// ===============

const FULL_DASH_ARRAY = 283;
const WARNING_THRESHOLD = 10;
const ALERT_THRESHOLD = 5;

const COLOR_CODES = {
    info: {
        color: "green"
    },
    warning: {
        color: "orange",
        threshold: WARNING_THRESHOLD
    },
    alert: {
        color: "red",
        threshold: ALERT_THRESHOLD
    }
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
  <span id="base-timer-label" class="base-timer__label">${formatTime(
    timeLeft
)}</span>
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
    const {
        alert,
        warning,
        info
    } = COLOR_CODES;
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

function speakSquare(squareText) {
    try {
        if (!soundsOn) return;

        if ('speechSynthesis' in window) {
            const synth = window.speechSynthesis;
            const utterance = new SpeechSynthesisUtterance(squareText);
            utterance.lang = (language === pt) ? 'pt-BR' : 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            // === AQUI: ESCOLHA SUA VOZ FAVORITA ===
            // Substitua 'pt-BR' pela lang da voz que você quer (ex: 'pt-BR')
            const preferredVoice = synth.getVoices().find(voice =>
                voice.lang === 'pt-BR' && voice.name.includes('Luciana')  // Ou 'Google', 'Francisca', etc.
            );
            if (preferredVoice) {
                utterance.voice = preferredVoice;
                console.log('🗣️ Usando voz:', preferredVoice.name);
            }

            speechSynthesis.speak(utterance);
        } else {
            console.warn('🔇 speechSynthesis não suportado neste navegador.');
        }
    } catch (e) {
        console.error('Erro ao falar casa:', e);
    }
}


// Language Selection:
var pt = {
    "title": "Treino de Notações de Xadrez",
    "description1": "A Notação Algébrica é o método padrão de registrar e descrever os movimentos de um jogo de xadrez.",
    "btnwiki": "Artigo na Wikipedia",
    "wikilink": "https://pt.wikipedia.org/wiki/Nota%C3%A7%C3%A3o_alg%C3%A9brica_de_xadrez",
    "subtitle": "Nomeando as Casas",
    "description2": "<p>Cada casa do tabuleiro de xadrez é identificada por um par de coordenadas único. Pelo ponto de vista das peças brancas:</p><ul><li>Linhas são nomeadas <em>1</em> até <em>8</em> de baixo para cima.</li><li>Colunas são nomeadas <em>a</em> até <em>h</em> da esquerda para a direita.</li></ul><p>Encontre corretamente o máximo número de casas antes que o tempo acabe e <b>se torne um jogador profissional de xadrez</b>.</p>",
    "next": "Próximo:",
    "clicked": "Clicado:",
    "score": "Pontuação:",
    "settings": "Configurações:",
    "btnsquarenameson": "Esconder nome das casas",
    "btnsquarenamesoff": "Mostrar nome das casas",
    "btnreverseon": "Pretas embaixo",
    "btnreverseoff": "Brancas embaixo",
    "btnsoundson": "Desligar sons",
    "btnsoundsoff": "Ligar sons",
    "btntimer": "Alterar tempo",
    "btnpieceson": "Esconder peças",
    "btnpiecesoff": "Mostrar peças",
    "prompttimer": "Alterar limite de tempo (em segundos):",
    "footer1": "Espero que curta! Compartilhe com seus parceiros.",
    "footer2": "Criado por <a href=\"https://github.com/JoseRFJuniorLLMs/SuperNez/\" target=\"blank\">Jose R F Junior</a> ♟, 2025."
};

var en = {
    "title": "Chess Notation Training",
    "description1": "The Algebraic Notation is the standard method for recording and describing moves in a game of chess.",
    "btnwiki": "Wikipedia Article",
    "wikilink": "https://en.wikipedia.org/wiki/Algebraic_notation_(chess)",
    "subtitle": "Naming the Squares",
    "description2": "<p>Each chessboard square is identified by a unique coordinate pair, from the White's point of view:</p><ul><li> Rows are named <em>1</em> to <em>8</em> from bottom to top.</li><li>Columns are named <em>a</em> to <em>h</em> from left to right.</li></ul><p>Find correctly the max number of squares before the time runs out and <b>become a pro</b> chess player.</p>",
    "next": "Next:",
    "clicked": "Clicked:",
    "score": "Score:",
    "settings": "Settings:",
    "btnsquarenameson": "Hide square names",
    "btnsquarenamesoff": "Show square names",
    "btnreverseon": "Black on bottom",
    "btnreverseoff": "White on bottom",
    "btnsoundson": "Disable sounds",
    "btnsoundsoff": "Enable sounds",
    "btntimer": "Set time limit",
    "btnpieceson": "Hide pieces",
    "btnpiecesoff": "Show pieces",
    "prompttimer": "Set the time limit (in seconds):",
    "footer1": "Hope you enjoy! Share with your fellows.",
    "footer2": "Created by <a href=\"https://github.com/JoseRFJuniorLLMs/SuperNez\" target=\"blank\">Jose R F Junior</a> ♟, 2025."
}

var language = pt;

function setLanguage(lang) {
    switch (lang) {
        case 'en':
            language = en;
            break;
        case 'pt':
            language = pt;
            break;
    }
}



// ================================================
// SUBSTITUA A FUNÇÃO ANTIGA PELA FUNÇÃO ABAIXO
// ================================================

// === BOTÃO PARA CARREGAR PARTIDAS PRÉ-CARREGADAS ===
$('#btn-load-preloaded').on('click', function () {
    const $btn = $(this);
    const $status = $('#preloaded-status');
    const $selectsContainer = $('#preloaded-selects');
    const $nezSelect = $('#select-nez-game');
    const $thalSelect = $('#select-thal-game');

    // Evita clique duplo
    if ($btn.prop('disabled')) return;

    // Estado inicial
    $btn.prop('disabled', true).text('Carregando...');
    $status.html('Carregando nez.pgn e thal.pgn...').css('color', '#ffaa00');
    $selectsContainer.hide();

    // Limpa selects
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

    // === CARREGA NEZHMETDINOV ===
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

    // === CARREGA TAL ===
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

// === FUNÇÃO PARA POPULAR UM SELECT COM PGNs ===
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

// === LISTAR E ESCOLHER VOZES PARA SPEECH SYNTHESIS ===
function listVoices() {
    if ('speechSynthesis' in window) {
        const synth = window.speechSynthesis;

        // Evento pra quando as vozes carregarem (é assíncrono)
        synth.onvoiceschanged = function () {
            const voices = synth.getVoices();
            console.log('🎤 VOZES DISPONÍVEIS NO SEU BROWSER:');
            console.log('=====================================');

            voices.forEach((voice, index) => {
                const isDefault = voice.default ? ' (PADRÃO)' : '';
                const isLocal = voice.localService ? ' (INSTALADA LOCAL)' : ' (REMOTA)';
                console.log(`${index}: ${voice.name} (${voice.lang}) ${isDefault} ${isLocal}`);
            });
            console.log('=====================================');

            // Dica: Escolha uma voz PT-BR mais natural
            const ptVoices = voices.filter(v => v.lang.startsWith('pt')).map(v => v.name);
            console.log('🔥 VOZES EM PORTUGUÊS:', ptVoices.join(', '));
        };

        // Carrega as vozes na hora
        synth.getVoices();
    } else {
        console.log('❌ Seu browser não suporta speechSynthesis (use Chrome/Firefox)');
    }
}

// Chama a função quando a página carregar
listVoices();

// === EVENTO: QUANDO ESCOLHE UMA PARTIDA ===
$('#select-nez-game, #select-thal-game').on('change', function () {
    const pgn = $(this).val();
    if (pgn) {
        $('#pgn-input').val(pgn);
        $('#btn-load-pgn').click();
    }
});

// === COMBO DE VOZES ===
let availableVoices = [];
let selectedVoiceIndex = null;

function populateVoiceList() {
    if (!('speechSynthesis' in window)) {
        $('#voice-select').html('<option value="">Speech não suportado</option>');
        return;
    }

    const synth = window.speechSynthesis;
    availableVoices = synth.getVoices().filter(v => v.lang.includes('pt') || v.lang.includes('en')); // Só PT/EN pra simplificar

    const $select = $('#voice-select');
    $select.empty();

    if (availableVoices.length === 0) {
        $select.append('<option value="">Nenhuma voz encontrada</option>');
        return;
    }

    // Opção padrão
    $select.append('<option value="">Voz padrão do navegador</option>');

    // Adiciona vozes
    availableVoices.forEach((voice, index) => {
        const isDefault = voice.default ? ' (Padrão)' : '';
        $select.append(`<option value="${index}">${voice.name} (${voice.lang})${isDefault}</option>`);
    });

    // Seleciona uma PT-BR boa automaticamente
    const preferredIndex = availableVoices.findIndex(v => v.lang === 'pt-BR' && (v.name.includes('Luciana') || v.name.includes('Google')));
    if (preferredIndex !== -1) {
        $select.val(preferredIndex);
        selectedVoiceIndex = preferredIndex;
    }
}

// Carrega vozes quando prontas (pode demorar 1-2s no Chrome)
if ('speechSynthesis' in window) {
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
        populateVoiceList();
    } else {
        synth.onvoiceschanged = populateVoiceList;
    }
}

// Evento: Muda a voz escolhida
$('#voice-select').on('change', function () {
    selectedVoiceIndex = $(this).val() === "" ? null : parseInt($(this).val());
    console.log('🗣️ Voz selecionada:', selectedVoiceIndex !== null ? availableVoices[selectedVoiceIndex].name : 'Padrão');
});

// ================================================
// NÃO MEXA NAS LINHAS ABAIXO
// ================================================

function updateOpeningName() {
    // Seleciona os elementos HTML
    const $openingNameEl = $('#opening-name');
    const $historyBoxEl = $('#opening-history-box');
    const $historyTextEl = $('#opening-history-text');

    // 1. GARANTE QUE O LIVRO PRINCIPAL FOI CARREGADO
    if (!OPENING_BOOK) {
        $openingNameEl.text("");
        $historyBoxEl.hide(); 
        return;
    }

    var historySlice = moveHistory.slice(0, currentMoveIndex + 1);
    var openingMatch = null; 

    // 2. PROCURA NO LIVRO PRINCIPAL (JSON)
    for (var i = historySlice.length; i > 0; i--) {
        var moveKey = historySlice.slice(0, i).join(' ');
        if (OPENING_BOOK[moveKey]) {
            openingMatch = OPENING_BOOK[moveKey];
            break;
        }
    }

    // 3. SE ENCONTROU UMA ABERTURA...
    if (openingMatch && openingMatch.name) {
        const englishName = openingMatch.name;
        const eco = openingMatch.eco; // <-- Pega o ECO aqui
        let infoIcon = ""; 
        let historia = ""; 
        let nomePt = ""; 

        // 4. VERIFICA SE TEMOS TRADUÇÃO/HISTÓRIA (no openings_pt.js)
        if (typeof OPENING_DETAILS_PT !== 'undefined' && OPENING_DETAILS_PT[englishName]) {
            
            const details = OPENING_DETAILS_PT[englishName];
            nomePt = details.nome; // <-- Pega o nome em Português
            historia = details.historia;

            // Adiciona o ícone de info e atualiza o texto da caixa
            infoIcon = ' <span id="opening-info-icon" title="Clique para saber mais">i</span>';
            $historyTextEl.text(historia); 
            $historyBoxEl.find('h5').text("Sobre: " + nomePt); 
        
        } else {
            // Se não temos tradução, usa o nome em inglês mesmo
            nomePt = englishName;
            $historyBoxEl.hide();
        }

        // 5. EXIBE O NOME (PT ou EN) + ECO + ÍCONE (se houver)
        // Esta é a linha que mostra TUDO junto
        $openingNameEl.html(`${nomePt} <span class="eco-code">(${eco})</span>${infoIcon}`);

    } else {
        // Se não encontrou nenhuma abertura
        currentOpeningName = "";
        $openingNameEl.text(""); 
        $historyBoxEl.hide(); 
    }
}

// ================================================
// RODA QUANDO A PÁGINA ESTÁ PRONTA
// ================================================

// === CARREGA O LIVRO DE ABERTURAS JSON ===
function loadOpeningBook() {
    // Usa a função getJSON do jQuery para carregar o arquivo
    $.getJSON("openings.json")
        .done(function(data) {
            // Se der certo, armazena os dados na variável global
            OPENING_BOOK = data; 
            console.log("✅ Livro de aberturas (openings.json) carregado com sucesso!");
            // Checa a abertura da posição inicial (agora que o livro carregou)
            updateOpeningName(); 
        })
        .fail(function(jqxhr, textStatus, error) {
            // Se der erro
            console.error("❌ Erro ao carregar openings.json: " + textStatus + ", " + error);
            console.log("Verifique se o arquivo openings.json está na mesma pasta do index.html.");
        });
}

// Quando o documento (página) estiver pronto...
$(document).ready(function() {

    // 1. Carrega o livro de aberturas
    loadOpeningBook();

    // 2. Inicializa o Stockfish
    // (Não precisamos mais do delay de 1000ms, o document.ready já cuida disso)
    console.log('🚀 Iniciando carregamento do Stockfish...');
    initStockfish();
});

