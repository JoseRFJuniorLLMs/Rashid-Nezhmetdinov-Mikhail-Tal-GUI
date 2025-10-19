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

// Stockfish Variables
var stockfish = null;
var stockfishReady = false;
var isAnalyzing = false;
var currentEvaluation = null;

// Initialize Stockfish
function initStockfish() {
    console.log('Função initStockfish() chamada');
    
    if (typeof STOCKFISH === 'undefined') {
        console.error('STOCKFISH não está definido. Verifique se o script foi carregado.');
        $('#stockfish-status').html('❌ Engine não disponível<br><small>Certifique-se de usar um servidor local (http://)</small>').css('color', '#ff0000');
        $('#btn-analyze').prop('disabled', true).text('Engine Indisponível');
        return;
    }
    
    try {
        if (typeof STOCKFISH === 'function') {
            console.log('Criando instância do Stockfish...');
            stockfish = STOCKFISH();
            
            stockfish.onmessage = function(event) {
                var line = event.data || event;
                console.log('Stockfish:', line);
                
                if (line === 'uciok') {
                    stockfishReady = true;
                    $('#stockfish-status').text('✓ Engine pronto').css('color', '#00ff00');
                    $('#btn-analyze').prop('disabled', false);
                    console.log('Stockfish inicializado com sucesso!');
                }
                
                if (line.startsWith('info') && line.includes('score')) {
                    parseStockfishInfo(line);
                }
                
                if (line.startsWith('bestmove')) {
                    var bestMove = line.split(' ')[1];
                    displayBestMove(bestMove);
                }
            };
            
            console.log('Enviando comandos UCI...');
            stockfish.postMessage('uci');
            stockfish.postMessage('setoption name Skill Level value 20');
            stockfish.postMessage('ucinewgame');
            
            $('#stockfish-status').text('⏳ Aguardando resposta...').css('color', '#ffaa00');
            
        } else {
            throw new Error('STOCKFISH não é uma função');
        }
    } catch (e) {
        console.error('Erro ao inicializar Stockfish:', e);
        $('#stockfish-status').html('❌ Erro ao carregar engine<br><small>' + e.message + '</small>').css('color', '#ff0000');
        $('#btn-analyze').prop('disabled', true).text('Engine com Erro');
    }
}

function parseStockfishInfo(line) {
    var match;
    
    if (line.includes('score cp')) {
        match = line.match(/score cp (-?\d+)/);
        if (match) {
            var cp = parseInt(match[1]);
            var evaluation = (cp / 100).toFixed(2);
            currentEvaluation = evaluation;
            $('#stockfish-eval').text(`Avaliação: ${evaluation > 0 ? '+' : ''}${evaluation}`);
        }
    } else if (line.includes('score mate')) {
        match = line.match(/score mate (-?\d+)/);
        if (match) {
            var mateIn = match[1];
            currentEvaluation = `Mate em ${Math.abs(mateIn)}`;
            $('#stockfish-eval').text(`${mateIn > 0 ? 'Brancas' : 'Pretas'} fazem mate em ${Math.abs(mateIn)}`);
        }
    }
    
    if (line.includes('depth')) {
        match = line.match(/depth (\d+)/);
        if (match) {
            $('#stockfish-depth').text(`Profundidade: ${match[1]}`);
        }
    }
}

function displayBestMove(move) {
    if (move && move !== '(none)') {
        var from = move.substring(0, 2);
        var to = move.substring(2, 4);
        $('#stockfish-bestmove').text(`Melhor jogada: ${from} → ${to}`);
        
        $('.chess-square').removeClass('highlight-from highlight-to');
        $(`#${from}`).addClass('highlight-from');
        $(`#${to}`).addClass('highlight-to');
    }
    isAnalyzing = false;
    $('#btn-analyze').text('Analisar Posição').prop('disabled', false);
}

function analyzePosition() {
    if (!stockfishReady) {
        $('#stockfish-eval').text('Engine não está pronto');
        return;
    }
    
    if (isAnalyzing) {
        stopAnalysis();
        return;
    }
    
    isAnalyzing = true;
    $('#btn-analyze').text('Parar Análise...').prop('disabled', false);
    $('#stockfish-eval').text('Analisando...');
    $('#stockfish-bestmove').text('Calculando...');
    
    var fen = loadedPgnGame.fen();
    
    stockfish.postMessage('stop');
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go depth 18');
}

function stopAnalysis() {
    if (stockfish && isAnalyzing) {
        stockfish.postMessage('stop');
        isAnalyzing = false;
        $('#btn-analyze').text('Analisar Posição').prop('disabled', false);
    }
}

$('#btn-analyze').click(function() {
    analyzePosition();
});

// ===============
// Game Buttons:
// ===============

$(".btn-play-pause").click(function() {
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

$(".chess-square").click(function() {
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

$("#btn-squarenames").click(function() {
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

$("#btn-pieces").click(function() {
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

$("#btn-sounds").click(function() {
    if (soundsOn) {
        soundsOn = false;
        $(this).text(function (i, text) {
            return language.btnsoundsoff;
        })
    } else {
        soundsOn = true;
        $(this).text(function (i, text) {
            return language.btnsoundson;
        })
    }
});

$("#btn-reverse").click(function() {
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

$('#btn-load-pgn').click(function() {
    var pgnText = $('#pgn-input').val().trim();
    
    if (!pgnText) {
        $('#pgn-status').text('Por favor, cole um PGN válido.');
        return;
    }
    
    try {
        loadedPgnGame = new Chess();
        if (loadedPgnGame.load_pgn(pgnText)) {
            moveHistory = loadedPgnGame.history();
            
            loadedPgnGame.reset();
            currentMoveIndex = -1;
            
            var white = loadedPgnGame.header()['White'] || 'Brancas';
            var black = loadedPgnGame.header()['Black'] || 'Pretas';
            $('#pgn-status').html(`<strong>Partida carregada:</strong><br>${white} vs ${black}<br>Total de lances: ${moveHistory.length}`);
            
            updateBoardDisplay();
            
            $('.pgn-navigation').show();
            $('.stockfish-panel').show();
            
            // Limpa a notação ao carregar nova partida
            $("#square-clicked").text("-");
            
            if (stockfishReady) {
                setTimeout(analyzePosition, 500);
            }
            
            playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-start.mp3");
        } else {
            $('#pgn-status').text('Erro: PGN inválido. Verifique o formato.');
        }
    } catch (e) {
        $('#pgn-status').text('Erro ao processar PGN: ' + e.message);
    }
});

$('#btn-pgn-start').click(function() {
    loadedPgnGame.reset();
    currentMoveIndex = -1;
    updateBoardDisplay();
    updateMoveInfo();
    $("#square-clicked").text("-");
    clearArrow();
    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
});

$('#btn-pgn-prev').click(function() {
    if (currentMoveIndex >= 0) {
        var undoneMove = loadedPgnGame.undo();
        currentMoveIndex--;
        updateBoardDisplay();
        updateMoveInfo();
        
        // ALTERAÇÃO: Mostra a notação do lance desfeito
        if (undoneMove) {
            $("#square-clicked").text(undoneMove.san);
            
            // Sistema de sons ao voltar: PRIMEIRO movimento, DEPOIS a casa
            if (soundsOn) {
                // 1º: Som de movimento
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
                
                // 2º: Depois toca o som da casa de origem
                setTimeout(function() {
                    var soundUrl = `sounds/${undoneMove.from}.mp3`;
                    playSound(soundUrl);
                }, 500);
            }
        }
        
        // Limpa as setas ao voltar
        clearArrow();
    }
});

$('#btn-pgn-next').click(function() {
    if (currentMoveIndex < moveHistory.length - 1) {
        currentMoveIndex++;
        var moveObj = loadedPgnGame.move(moveHistory[currentMoveIndex]);
        updateBoardDisplay();
        updateMoveInfo();

        // ALTERAÇÃO: Mostra a notação do lance (Peça e Casa)
        if (moveObj) {
            $("#square-clicked").text(moveObj.san);
            
            // Desenha seta do movimento
            drawArrow(moveObj.from, moveObj.to);
            
            // Sistema de sons: PRIMEIRO o som do movimento, DEPOIS o som da casa
            if (soundsOn) {
                // 1º: Toca o som do movimento (captura ou normal)
                if (moveObj.captured) {
                    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3");
                } else {
                    playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
                }
                
                // 2º: Depois de 500ms, toca o som da casa de destino
                setTimeout(function() {
                    var soundUrl = `sounds/${moveObj.to}.mp3`;
                    playSound(soundUrl);
                }, 500);
            }
        }

        // Analisar nova posição
        if (stockfishReady) {
            setTimeout(analyzePosition, 300);
        }
    }
});

$('#btn-pgn-end').click(function() {
    var lastMoveObj = null;
    
    // Carregar o PGN novamente e ir para o fim
    loadedPgnGame.load_pgn($('#pgn-input').val().trim());
    currentMoveIndex = moveHistory.length - 1;

    // ALTERAÇÃO: Pega o último lance do histórico para mostrar a notação
    if (moveHistory.length > 0) {
        var lastMoveSan = moveHistory[currentMoveIndex];
        var tempGame = new Chess();
        tempGame.load_pgn($('#pgn-input').val().trim());
        lastMoveObj = tempGame.history({verbose: true}).pop();
    }
    
    updateBoardDisplay();
    updateMoveInfo();
    
    // ALTERAÇÃO: Mostra a notação do último lance
    if (lastMoveObj) {
        $("#square-clicked").text(lastMoveObj.san);
        // Desenha seta do último movimento
        drawArrow(lastMoveObj.from, lastMoveObj.to);
        
        // Sistema de sons: PRIMEIRO movimento, DEPOIS a casa
        if (soundsOn) {
            // 1º: Som do movimento ou captura
            if (lastMoveObj.captured) {
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3");
            } else {
                playSound("https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3");
            }
            
            // 2º: Depois toca o som da casa de destino
            setTimeout(function() {
                var soundUrl = `sounds/${lastMoveObj.to}.mp3`;
                playSound(soundUrl);
            }, 500);
        }
    }
});

function updateMoveInfo() {
    if (moveHistory.length === 0) return;
    
    var moveNum = Math.floor(currentMoveIndex / 2) + 1;
    var isWhite = currentMoveIndex % 2 === 0;
    var currentMove = currentMoveIndex >= 0 ? moveHistory[currentMoveIndex] : 'Início';
    
    $('#current-move').text(`Lance ${currentMoveIndex + 1}/${moveHistory.length}: ${currentMove}`);
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
  var audio = new Audio(name);
  audio.play();
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

//Language Selection:
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
    "footer2": "Criado por <a href=\"https://github.com/JoseRFJuniorLLMs/SuperNez/\" target=\"blank\">Jose R F Junior</a> ♟, 2021."
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
    "footer2": "Created by <a href=\"https://github.com/JoseRFJuniorLLMs/SuperNez\" target=\"blank\">Jose R F Junior</a> ♟, 2021."
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
    $(document).ready(function () {
        $('#title').text(language.title);
        $('#btn-wiki').text(language.btnwiki);
        $('#btn-wiki').attr("href", language.wikilink);
        $('#subtitle').text(language.subtitle);
        $('#description1').text(language.description1);
        $('#description2').html(language.description2);
        $('#next').text(language.next);
        $('#clicked').text(language.clicked);
        $('#score').text(language.score);
        $('#settings').text(language.settings);
        if (squarenames) $('#btn-squarenames').text(language.btnsquarenameson);
        else $('#btn-squarenames').text(language.btnsquarenamesoff);
        if (reverse) $('#btn-reverse').text(language.btnreverseon);
        else $('#btn-reverse').text(language.btnreverseoff);
        if (soundsOn) $('#btn-sounds').text(language.btnsoundson);
        else $('#btn-sounds').text(language.btnsoundsoff);
        $('#btn-timer').text(language.btntimer);
        if (pieces) $('#btn-pieces').text(language.btnpieceson);
        else $('#btn-pieces').text(language.btnpiecesoff);
        $('#footer1').html(language.footer1);
        $('#footer2').html(language.footer2);
    });
}

$(document).ready(function() {
    setLanguage('pt');
    console.log('Tentando inicializar Stockfish...');
    initStockfish();
    
    setTimeout(function() {
        console.log('Stockfish pronto?', stockfishReady);
    }, 2000);
});

function drawArrow(fromSquareId, toSquareId) {
    const svg = document.getElementById('move-arrow-layer');
    if (!svg) {
        console.error('Elemento move-arrow-layer não encontrado');
        return;
    }
    
    svg.innerHTML = '';

    const fromEl = document.getElementById(fromSquareId);
    const toEl = document.getElementById(toSquareId);
    
    if (!fromEl || !toEl) {
        console.error('Casas não encontradas:', fromSquareId, toSquareId);
        return;
    }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    
    const boardRect = document.querySelector('.chess-board').getBoundingClientRect();
    
    const x1 = fromRect.left + fromRect.width/2 - boardRect.left;
    const y1 = fromRect.top + fromRect.height/2 - boardRect.top;
    const x2 = toRect.left + toRect.width/2 - boardRect.left;
    const y2 = toRect.top + toRect.height/2 - boardRect.top;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#FF6B6B');
    line.setAttribute('stroke-width', '5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.8');
    svg.appendChild(line);

    const angle = Math.atan2(y2-y1, x2-x1);
    const size = 15;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    const points = [
        [x2, y2],
        [x2 - size*Math.cos(angle-Math.PI/6), y2 - size*Math.sin(angle-Math.PI/6)],
        [x2 - size*Math.cos(angle+Math.PI/6), y2 - size*Math.sin(angle+Math.PI/6)]
    ];
    arrow.setAttribute('points', points.map(p => p.join(',')).join(' '));
    arrow.setAttribute('fill','#FF6B6B');
    arrow.setAttribute('opacity', '0.8');
    svg.appendChild(arrow);
    
    // Torna o SVG visível
    svg.style.display = 'block';
}

function clearArrow() {
    const svg = document.getElementById('move-arrow-layer');
    if (svg) {
        svg.innerHTML = '';
        svg.style.display = 'none';
    }
}