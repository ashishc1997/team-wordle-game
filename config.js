/* ==========================================================================
   TEAM WORDLE — CONFIGURATION
   This is the only file you need to edit before the game.
   ========================================================================== */

const CONFIG = {

  /* ---- TEAM A ---------------------------------------------------------- */
  teamA: {
    name: "Team A",
    members: [
      "Ashish Garg",
      "Shivam",
      "Ujjala",
      "Siddharth",
    ],
  },

  /* ---- TEAM B ---------------------------------------------------------- */
  teamB: {
    name: "Team B",
    members: [
      "Player 5",
      "Player 6",
      "Player 7",
      "Player 8",
    ],
  },

  /* ---- GAME SETTINGS --------------------------------------------------- */
  turnSeconds: 600,   // time per team, in seconds (600 = 10 minutes).
                      // Also editable on the start screen before kick-off.
  pointsPerWord: 5,   // points for solving a word within maxAttempts
  maxAttempts: 6,     // guesses allowed per word
};
