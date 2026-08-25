# Electronic Scrabble WebSocket Protocol

## Game Lobby

```mermaid
sequenceDiagram
    participant Admin
    participant Server
    participant Screen
    participant Player1
    participant Player2

    Admin->>Server: create-game
    Server-->>Admin: game-created (ABCD)

    Screen->>Server: watch-game (ABCD)
    Server-->>Screen: game-state

    Player1->>Server: join-game (ABCD, Alice)
    Server-->>Player1: game-joined
    Server-->>Admin: game-state
    Server-->>Screen: game-state
    Server-->>Player1: game-state

    Player2->>Server: join-game (ABCD, Bob)
    Server-->>Player2: game-joined
    Server-->>Admin: game-state
    Server-->>Screen: game-state
    Server-->>Player1: game-state
    Server-->>Player2: game-state
```

## Client Messages

### Create Game

```json
{
    "type": "create-game"
}
```

### Watch Game

```json
{
    "type": "watch-game",
    "gameCode": "ABCD"
}
```

### Join Game

```json
{
    "type": "join-game",
    "gameCode": "ABCD",
    "playerName": "Alice"
}
```

## Server Messages

### Game Created

```json
{
    "type": "game-created",
    "gameCode": "ABCD"
}
```

### Game Joined

```json
{
    "type": "game-joined",
    "gameCode": "ABCD",
    "playerId": "UUID",
    "playerName": "Alice"
}
```

### Public Game State

```json
{
    "type": "game-state",
    "game": {
        "code": "ABCD",
        "status": "lobby",
        "players": [
            {
                "id": "UUID",
                "name": "Alice"
            }
        ]
    }
}
```