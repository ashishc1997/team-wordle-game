# Team Wordle

A two-team Wordle race for a team fun session. Pure HTML/CSS/JS — no build step,
no server, no internet. Double-click `index.html` and play.

## Running it

1. Download/clone the folder.
2. Double-click `index.html`. It opens in any modern browser and works offline.

That's it. Keep all the files in the same folder.

`rules.html` is a standalone rules sheet — the objective, what each tile colour
means, and the team rules. It's linked from the start screen ("Full rules &
colour guide"), and you can open or share it on its own before the game starts.

## Before the game — edit `config.js`

```js
const CONFIG = {
  teamA: { name: "Team A", members: ["Alice", "Bob", "Chen"] },
  teamB: { name: "Team B", members: ["Dev", "Esha", "Farid"] },
  turnSeconds: 600,   // 10 minutes per team (also editable on the start screen)
  pointsPerWord: 5,
  maxAttempts: 5,
};
```

Change the two team names and drop in the names from the call. Any number of
members per team — the panels grow to fit.

To change the words, edit `words.js`. Keep them 5 letters, uppercase, A–Z.

## How a game runs

1. **Start screen** — check the rosters, set the minutes, hit `Start Team A`.
2. **Team A plays.** The clock runs continuously. Solve a word and the next one
   loads automatically. Miss all 5 attempts and the answer is revealed before
   moving on — no passing.
3. **Clock hits zero** — hard stop. A word in progress scores nothing. Team A's
   score is shown, then `Start Team B` when the room is ready.
4. **Team B plays** the same way with a fresh clock and completely different words.
5. **Result** — winner (or tie), both scores, and every word each team solved or missed.

Scoring: **+5** for each word solved within 5 attempts, **0** for a miss.

## Controls

| Action | Key |
| --- | --- |
| Type a letter | A–Z (or click the on-screen keyboard) |
| Submit a guess | `Enter` |
| Delete a letter | `Backspace` |
| Pause / resume | `Esc`, or the Pause button |

Any 5 letters is an accepted guess — the dictionary is small, so guesses aren't
checked against it. That keeps probe words like `CRANE` usable.

## Fairness notes

- The word list is shuffled once per game and split in half. Team A and Team B
  draw from different halves, so there is no overlap and no spoilers.
- The clock is frozen while paused and during the brief answer reveal between
  words, so neither costs a team any of their time.
