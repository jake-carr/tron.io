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

  // If user is host, invoke main.
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
