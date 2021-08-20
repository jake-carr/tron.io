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
  if (redWins && blueWins) {socket.emit('GAME_END', {
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
      if (red.snake[i].x == blue_head.x && red.snake[i].y == blue_head.y) {
        blueHitRed = true;
      }
      if (blue.snake[i].x == red_head.x && blue[i].y == red_head.y) {
        redHitBlue = true;
      }
    }
    if (redHitBlue && blueHitRed) {
      socket.emit('game-tie', {
        reason: 'player collision',
      });
    } else if (redHitBlue && !blueHitRed) {
      socket.emit('blue-win', {
        reason: 'player collision',
      });
    } else if (blueHitRed && !redHitBlue) {
      socket.emit('red-win', {
        reason: 'player collision',
      });
    }
  }
  check_head_body_collision();

  // Check for head to head collison; tie if found
  function check_head_to_head_collision() {
    if (blue_head.x == red_head.x && blue_head.y == red_head.y) {
      socket.emit('game-tie', {
        reason: 'head to head collision',
      });
    }
  }
  check_head_to_head_collision();
}

function extend() {
  // Double speed if riding a player trail; return to normal speed otherwise.
  function is_riding_trail(head) {
    for (let i = 0; i < red.snake.length - 2; i++) {
      const red_body = red.snake;
      const blue_body = blue.snake;
      if (
        // if head is same x and y +/= 10 as either body[i];
        (head.x == red_body[i].x &&
          (head.y == red_body[i].y - 10 ||
            head.y == red_body[i].y + 10)) ||
        (head.x == blue_body[i].x &&
          (head.y == blue_body[i].y - 10 ||
            head.y == blue_body[i].y + 10))
      ) {
        return true;
      } else if (
        // or if head is same y and x +/- 10 as either body[i];
        (head.y == red_body[i].y &&
          (head.x == red_body[i].x - 10 ||
            head.x == red_body[i].x + 10)) ||
        (head.y == blue_body[i].y &&
          (head.x == blue_body[i].x - 10 ||
            head.x == blue_body[i].x + 10))
      ) {
        return true;
      }
    }
    return false;
  }

  const current_red = red.snake[red.snake.length - 1];
  const current_blue = blue.snake[blue.snake.length - 1];
  const red_is_speedy = is_riding_trail(current_red);
  const blue_is_speedy = is_riding_trail(current_blue);

  // Create the new heads
  function calculate_position(player, is_speedy) {
    if (is_speedy) {
      return [
        {
          x: player.snake[player.snake.length - 1].x + player.dx,
          y: player.snake[player.snake.length - 1].y + player.dy,
        },
        {
          x:
            player.snake[player.snake.length - 1].x +
            player.dx +
            player.dx,
          y:
            player.snake[player.snake.length - 1].y +
            player.dy +
            player.dy,
        },
      ];
    } else {
      return {
        x: player.snake[player.snake.length - 1].x + player.dx,
        y: player.snake[player.snake.length - 1].y + player.dy,
      };
    }
  }

  const heads = {
    red: calculate_position(red, red_is_speedy),
    blue: calculate_position(blue, blue_is_speedy),
  };

  // Append movements to bodies
  const { red, blue } = heads;
  red_is_speedy ? red.snake.concat(red) : red.snake.push(red);
  blue_is_speedy ? blue.snake.concat(blue) : blue.snake.push(blue);
}
