const socket = io();
const hostButton = document.getElementById('host');
const joinButton = document.getElementById('join');
const main = document.getElementById('main');

let usernameinput = window.prompt('Username ?');
if (!usernameinput) usernameinput = 'GUEST';

let USER = {
  username: usernameinput,
  socketID: '',
  room: {},
  hosting: false,
  score: 0,
};

function clear() {
  while (main.firstChild) {
    main.firstChild.remove();
  }
  return;
}

/* Home Page */

hostButton.addEventListener('click', () => {
  const roomName = prompt('Name of Lobby: ');

  function callback(room) {
    USER.room = room;
    USER.hosting = true;
    USER.socketID = room.host.socketId;
    renderLobby(room, USER, null);
    console.log(`Hosting lobby ${room.name} as ${USER.username}`);
  }

  socket.emit('createRoom', roomName, USER, callback);
});

joinButton.addEventListener('click', () => {
  function callback(rooms) {
    const roomList = document.getElementById('roomList');
    while (roomList.firstChild) {
      roomList.firstChild.remove();
    }
    // Make a button for each available room
    for (let room of rooms) {
      const option = document.createElement('button');
      option.innerText = room.name;
      // Function to join room
      option.addEventListener('click', () => {
        function join(lobby) {
          if (lobby == 'Error: Room Full') {
            alert('Sorry, that room is full!');
            return;
          }
          USER.hosting = false;
          USER.room = lobby;
          console.log(`${USER.username} joined lobby: ${lobby.name}`);
          socket.emit('guestJoined', lobby.id, USER);
          renderLobby(lobby, lobby.host.user, USER);
        }
        socket.emit('joinRoom', room.id, join);
      });
      roomList.appendChild(option);
    }

    // If roomList is empty, display a message
    if (!roomList.children.length) {
      clear();
      const noRooms = document.createElement('p');
      noRooms.innerText = 'No rooms found!';
      roomList.appendChild(noRooms);
    }

    // Append list to page and change button text to refresh
    joinButton.innerText = 'Refresh';
    main.appendChild(roomList);
  }

  socket.emit('getRoomNames', callback);
});

/* Lobby Page */
let savedRoomID;

function renderLobby(room, host, guest) {
  clear();

  // Create lobby elements
  const playerList = document.createElement('div');
  const start = document.createElement('button');

  start.innerText = 'Start game';
  start.addEventListener('click', () => {
    if (!USER.hosting) {
      alert('Only the host can start the game.');
    } else if (playerList.children.length == 2) {
      savedRoomID = room.id;
      socket.emit(
        'GAME_START_REQUEST',
        room.id,
        host,
        guest,
        initializeGame,
      );
    } else {
      alert('Need two players to start.');
    }
  });

  const lobbyName = room.name;
  const title = document.createElement('h2');
  title.innerText = `You are in lobby: "${lobbyName}" :^)`;

  const hostName = document.createElement('p');
  hostName.classList.add('hostName');
  hostName.innerText = `Host: ${host.username}`;
  playerList.appendChild(hostName);

  if (guest) {
    const guestName = document.createElement('p');
    guestName.classList.add('guestName');
    guestName.innerText = `Guest: ${guest.username}`;
    playerList.appendChild(guestName);
  }

  main.appendChild(title);
  main.appendChild(playerList);
  main.appendChild(start);
}

// Re-render lobby HTML on host side once a guest joins.
socket.on('renderGuest', (guest) => {
  if (USER.hosting) {
    console.log(`Guest ${guest.username} joined.`);
    renderLobby(USER.room, USER, guest);
  }
});

// TODO handle guests leaving/rooms closing.

/* Game */
// Red is always host/source of truth.
let GAME_STATE = {
  red: {
    snake: [{ x: 400, y: 290 }],
    isTurning: false,
    dx: -10,
    dy: 0,
    score: 0,
  },
  blue: {
    snake: [{ x: 410, y: 290 }],
    isTurning: false,
    dx: 10,
    dy: 0,
    score: 0,
  },
};
let winner = false;

function initializeGame(
  red_name,
  blue_name,
  red_score = 0,
  blue_score = 0,
) {
  clear();

  const scoreboard = document.createElement('div');
  const scoreRED = document.createElement('p');
  const scoreBLUE = document.createElement('p');

  scoreRED.innerText = `${red_name}: ${red_score}`;
  scoreBLUE.innerText = `${blue_name}: ${blue_score}`;

  scoreboard.appendChild(scoreRED);
  scoreboard.appendChild(scoreBLUE);

  const arena = document.createElement('CANVAS');
  arena.setAttribute('id', 'arena');
  arena.setAttribute('width', '810');
  arena.setAttribute('height', '500');

  main.appendChild(scoreboard);
  main.appendChild(arena);

  // If user is host, invoke main game function.
  if (USER.hosting) {
    tron();
  }
}

socket.on('GAME_START', (host, guest) => {
  console.log('Game starting.');
  initializeGame(
    host.username,
    guest.username,
    host.score,
    guest.score,
  );
});

// Constants
const colors = {
  red: {
    head: 'pink',
    body: 'red',
    outline: 'darkred',
  },
  blue: {
    head: 'lightblue',
    body: 'blue',
    outline: 'darkblue',
  },
};

// Main game function invoked by host client every 100ms.
function tron() {
  if (!winner) {
    check_for_win(GAME_STATE); // Emits GAME_END, winner and reason if found.
    GAME_STATE.red.isTurning = false;
    GAME_STATE.blue.isTurning = false;

    setTimeout(function gameLoop() {
      extend(GAME_STATE); // Extend emits GAME_TICK.
      tron(); // Repeat
    }, 100);
  }
}

function check_for_win(gameState) {
  const { red, blue } = gameState;
  let redWins = false;
  let blueWins = false;

  // Look for wall collisions; emit tie or winner, or continue.
  function check_wall_collision(player) {
    const { snake } = player;
    const head = snake[snake.length - 1];
    const hitLeftWall = head.x < 0;
    const hitRightWall = head.x > arena.width - 10;
    const hitTopWall = head.y < 0;
    const hitBottomWall = head.y > arena.height - 10;
    return hitLeftWall || hitRightWall || hitTopWall || hitBottomWall;
  }

  redWins = check_wall_collision(blue);
  blueWins = check_wall_collision(red);
  if (redWins && blueWins) {
    socket.emit('GAME_END', {
      winner: 'tie',
      reason: 'wall collision',
    });
  } else if (redWins && !blueWins) {
    socket.emit('GAME_END', {
      winner: 'red',
      reason: 'wall collision',
    });
  } else if (blueWins && !redWins) {
    socket.emit('GAME_END', {
      winner: 'blue',
      reason: 'wall collision',
    });
  }

  // Check for collisions with self (suicides)
  function check_suicide(player) {
    const { snake } = player;
    const head = snake[snake.length - 1];
    for (let i = 0; i < snake.length - 2; i++) {
      if (snake[i].x == head.x && snake[i].y == head.y) {
        return true;
      }
    }
  }

  redWins = check_suicide(blue);
  blueWins = check_suicide(red);
  if (redWins && blueWins) {
    socket.emit('GAME_END', {
      winner: 'tie',
      reason: 'suicide',
    });
  } else if (redWins && !blueWins) {
    socket.emit('GAME_END', {
      winner: 'red',
      reason: 'suicide',
    });
  } else if (blueWins && !redWins) {
    socket.emit('GAME_END', {
      winner: 'blue',
      reason: 'suicide',
    });

    let red_head = red.snake[red.snake.length - 1];
    let blue_head = blue.snake[blue.snake.length - 1];

    // Check for head/body collisions; emit tie or winner, or continue.
    function check_head_body_collision() {
      let redHitBlue = false;
      let blueHitRed = false;
      for (let i = 0; i < red.snake.length - 2; i++) {
        if (
          red.snake[i].x == blue_head.x &&
          red.snake[i].y == blue_head.y
        ) {
          blueHitRed = true;
        }
        if (
          blue.snake[i].x == red_head.x &&
          blue.snake[i].y == red_head.y
        ) {
          redHitBlue = true;
        }
      }
      if (redHitBlue && blueHitRed) {
        socket.emit('GAME_END', {
          winner: 'tie',
          reason: 'player collision',
        });
      } else if (redHitBlue && !blueHitRed) {
        socket.emit('GAME_END', {
          winner: 'blue',
          reason: 'player collision',
        });
      } else if (blueHitRed && !redHitBlue) {
        socket.emit('GAME_END', {
          winner: 'red',
          reason: 'player collision',
        });
      }
    }
    check_head_body_collision();

    // Check for head to head collison; tie if found
    function check_head_to_head_collision() {
      if (blue_head.x == red_head.x && blue_head.y == red_head.y) {
        socket.emit('GAME_END', {
          winner: 'tie',
          reason: 'head to head collision',
        });
      }
    }
    check_head_to_head_collision();
  }
}

function extend(gameState) {
  const { red, blue } = gameState;

  // Create the new heads
  function calculate_position(player) {
    return {
      x: player.snake[player.snake.length - 1].x + player.dx,
      y: player.snake[player.snake.length - 1].y + player.dy,
    };
  }

  // Append new position to bodies
  red.snake.push(calculate_position(red));
  blue.snake.push(calculate_position(blue));

  // Emit game update
  socket.emit('GAME_UPDATE', savedRoomID, gameState);
}

// Canvas drawing functions
function draw_board() {
  const arena = document.getElementById('arena');
  const context = arena.getContext('2d');
  // Draw a border around the canvas
  // Background color
  context.fillStyle = 'white';
  // Border color
  context.strokestyle = 'black';
  // Conver canvas with filled rectangle
  context.fillRect(0, 0, arena.width, arena.height);
  // Draw a "border" around the entire canvas
  context.strokeRect(0, 0, arena.width, arena.height);
}

function draw(red, blue) {
  const arena = document.getElementById('arena');
  const context = arena.getContext('2d');

  function draw_cell(color, x, y, is_head) {
    if (is_head) {
      context.fillStyle = colors[color].head;
    } else {
      context.fillStyle = colors[color].body;
    }
    context.strokestyle = colors[color].outline;

    context.fillRect(x, y, 10, 10);
    context.strokeRect(x, y, 10, 10);
  }

  // Draw both players.
  for (let cell of red.snake) {
    let isHead = red.snake.indexOf(cell) == red.snake.length - 2;
    draw_cell('red', cell.x, cell.y, isHead);
  }
  for (let cell of blue.snake) {
    let isHead = red.snake.indexOf(cell) == red.snake.length - 2;
    draw_cell('red', cell.x, cell.y, isHead);
  }
}

socket.on('GAME_TICK', (gameState) => {
  // Update local game state
  GAME_STATE = gameState;
  const { red, blue } = GAME_STATE;

  // Re-render
  draw_board();
  draw(red, blue);
});
