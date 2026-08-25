# Electronic Scrabble WebSocket Protocol

## Version 0.3.0

This document describes the WebSocket messages used during game creation,
lobby synchronization, player reconnection, and game startup.

## Lobby and Game Start

```mermaid
sequenceDiagram
    participant Admin
    participant Server
    participant Screen
    participant P1 as Player 1
    participant P2 as Player 2

    Admin->>Server: create-game
    Server-->>Admin: game-created

    Screen->>Server: watch-game
    Server-->>Screen: game-state

    P1->>Server: join-game
    Server-->>P1: game-joined + private playerToken
    Server-->>Admin: game-state
    Server-->>Screen: game-state

    P2->>Server: join-game
    Server-->>P2: game-joined + private playerToken
    Server-->>Admin: game-state
    Server-->>Screen: game-state

    Admin->>Server: start-game
    Server->>Server: Create and shuffle 102-tile bag
    Server->>Server: Deal 7 tiles to each player
    Server-->>Admin: game-started
    Server-->>Screen: game-started
    Server-->>P1: player-state with private rack
    Server-->>P2: player-state with private rack
    Server-->>All: game-state without rack contents
```

## Player Reconnection

```mermaid
sequenceDiagram
    participant Player
    participant Server

    Player->>Server: resume-game(gameCode, playerToken)
    Server->>Server: Validate private player token
    Server-->>Player: session-resumed
    Server-->>Player: player-state with private rack
    Server-->>Player: game-state
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

### Resume Game

```json
{
    "type": "resume-game",
    "gameCode": "ABCD",
    "playerToken": "PRIVATE-UUID"
}
```

### Start Game

```json
{
    "type": "start-game"
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

The `playerToken` is private and must never be broadcast to other clients.

```json
{
    "type": "game-joined",
    "gameCode": "ABCD",
    "playerId": "UUID",
    "playerToken": "PRIVATE-UUID",
    "playerName": "Alice"
}
```

### Session Resumed

```json
{
    "type": "session-resumed",
    "gameCode": "ABCD",
    "playerId": "UUID",
    "playerName": "Alice"
}
```

### Public Game State

Rack contents and player tokens are never included in this message.

```json
{
    "type": "game-state",
    "game": {
        "code": "ABCD",
        "status": "playing",
        "bagRemaining": 88,
        "players": [
            {
                "id": "UUID",
                "name": "Alice",
                "score": 0,
                "rackCount": 7,
                "connected": true
            },
            {
                "id": "UUID",
                "name": "Bob",
                "score": 0,
                "rackCount": 7,
                "connected": true
            }
        ]
    }
}
```

### Private Player State

This message is sent only to the authenticated player's WebSocket connection.

```json
{
    "type": "player-state",
    "gameCode": "ABCD",
    "player": {
        "id": "UUID",
        "name": "Alice",
        "score": 0,
        "rack": [
            {
                "id": "UUID",
                "letter": "A",
                "value": 1,
                "isBlank": false
            }
        ]
    }
}
```

## Privacy Rule

The server is authoritative. Public messages may expose only public game data.
Private rack contents and reconnection tokens must be sent exclusively to the
WebSocket connection authenticated for the corresponding player.
