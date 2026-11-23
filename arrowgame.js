import {
  doc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DIRECTIONS = ["up", "down", "left", "right"];
const LEADERBOARD_LIMIT = 10;
const HIGH_SCORE_KEY = "arrow-game-high-score";
const LEADERBOARD_DOCUMENT = ["arrowGameLeaderboards", "top10"];
const DIRECTION_SPEED_INCREMENT = 0.02;
const MAX_DIRECTION_PLAYBACK_RATE = 1.4;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function sortEntries(entries) {
  return entries.sort((first, second) =>
    second.score - first.score ||
    Date.parse(first.submittedAt) - Date.parse(second.submittedAt)
  );
}

function readEntries(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("The Arrow Game leaderboard has an invalid format.");
  }
  return sortEntries(value.map((entry) => {
    if (!entry || !Number.isSafeInteger(entry.score) || entry.score < 1 ||
        typeof entry.name !== "string" || !entry.name.trim() ||
        typeof entry.submittedAt !== "string" || !Number.isFinite(Date.parse(entry.submittedAt)) ||
        (entry.image !== null && (typeof entry.image !== "string" ||
          !entry.image.startsWith("data:image/jpeg;base64,")))) {
      throw new Error("The Arrow Game leaderboard contains an invalid score.");
    }
    return {
      score: entry.score,
      name: entry.name,
      image: entry.image,
      submittedAt: entry.submittedAt
    };
  })).slice(0, LEADERBOARD_LIMIT);
}

function playAudio(audio) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPaused);
      audio.removeEventListener("error", onError);
    };
    const onEnded = () => {
      cleanup();
      resolve();
    };
    const onPaused = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("A game sound could not be loaded or played."));
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPaused);
    audio.addEventListener("error", onError);
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch((error) => {
        cleanup();
        reject(error);
      });
    }
  });
}

export function setupArrowGame({ db, markdownToHtml, resizeImageToBase64, onReturnToBlog }) {
  const root = document.getElementById("arrow-game-root");
  const siteNav = document.getElementById("site-nav");
  const gameNav = document.getElementById("game-nav");
  const workspace = createElement("main", "arrow-game-workspace");
  const gameView = createElement("section", "arrow-game-view");
  const howToView = createElement("article", "arrow-game-view markdown-body");
  const leaderboardView = createElement("section", "arrow-game-view");
  const gameAudio = Object.fromEntries(
    DIRECTIONS.map((direction) => [direction, new Audio(`assets/${direction}.mp3`)])
  );
  const activeBeepAudios = new Set();
  const leaderboardRef = doc(db, ...LEADERBOARD_DOCUMENT);
  let activeView = "game";
  let currentView = "";
  let sequence = [];
  let score = 0;
  let highScore = 0;
  let inputIndex = 0;
  let phase = "idle";
  let leaderboardEntries = [];
  let leaderboardLoaded = false;
  let submitting = false;
  let howToLoading = false;
  let howToLoaded = false;

  Object.values(gameAudio).forEach((audio) => {
    audio.preload = "auto";
  });
  const title = createElement("h1", "", "Arrow Game");
  const startButton = createElement("button", "arrow-game-start", "Start Game");
  startButton.type = "button";
  const scoreDisplay = createElement("p", "arrow-game-score", "Score: 0");
  scoreDisplay.hidden = true;
  const status = createElement("p", "arrow-game-status", "Press Start Game to begin.");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const buttonPad = createElement("div", "arrow-game-pad");
  buttonPad.setAttribute("role", "group");
  buttonPad.setAttribute("aria-label", "Directional buttons");
  const directionButtons = new Map();
  DIRECTIONS.forEach((direction) => {
    const button = createElement("button", "arrow-game-direction", direction);
    button.type = "button";
    button.dataset.direction = direction;
    button.disabled = true;
    button.setAttribute("aria-label", direction);
    button.addEventListener("click", () => {
      handleDirectionInput(direction);
    });
    directionButtons.set(direction, button);
    buttonPad.appendChild(button);
  });

  const submissionSection = createElement("section", "arrow-game-submission");
  const submissionHeading = createElement("h2", "", "Leaderboard Submission");
  const highScoreDisplay = createElement("p", "arrow-game-high-score");
  const eligibilityHint = createElement("p", "arrow-game-eligibility");
  const submissionForm = createElement("form", "arrow-game-form");
  const nameLabel = createElement("label", "", "Name (required)");
  const nameInput = createElement("input");
  nameInput.type = "text";
  nameInput.name = "name";
  nameInput.required = true;
  nameInput.maxLength = 40;
  nameInput.autocomplete = "nickname";
  nameLabel.appendChild(nameInput);
  const imageLabel = createElement("label", "", "Picture (optional)");
  const imageInput = createElement("input");
  imageInput.type = "file";
  imageInput.name = "picture";
  imageInput.accept = "image/*";
  imageLabel.appendChild(imageInput);
  const submitButton = createElement("button", "arrow-game-submit", "Submit High Score");
  submitButton.type = "submit";
  submitButton.disabled = true;
  const submitStatus = createElement("p", "arrow-game-submit-status");
  submitStatus.setAttribute("role", "status");
  submitStatus.setAttribute("aria-live", "polite");
  submissionForm.append(nameLabel, imageLabel, submitButton, submitStatus);
  submissionSection.append(submissionHeading, highScoreDisplay, eligibilityHint, submissionForm);
  gameView.append(title, startButton, scoreDisplay, status, buttonPad, submissionSection);

  const leaderboardTitle = createElement("h1", "", "Arrow Game Leaderboard");
  const leaderboardStatus = createElement("p", "arrow-game-empty", "Loading leaderboard...");
  const tableWrap = createElement("div", "arrow-game-table-wrap");
  const leaderboardTable = createElement("table", "arrow-game-leaderboard");
  const tableHead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Place", "Image", "Name", "Score", "Submission date", "Submission time"].forEach((label) => {
    headerRow.appendChild(createElement("th", "", label));
  });
  tableHead.appendChild(headerRow);
  const tableBody = document.createElement("tbody");
  leaderboardTable.append(tableHead, tableBody);
  tableWrap.appendChild(leaderboardTable);
  leaderboardView.append(leaderboardTitle, leaderboardStatus, tableWrap);

  const views = new Map([
    ["game", gameView],
    ["how-to-play", howToView],
    ["leaderboard", leaderboardView]
  ]);
  workspace.append(gameView, howToView, leaderboardView);
  root.replaceChildren(workspace);

  const directionsForKeyboard = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right"
  };

  function setDirectionButtonsEnabled(enabled) {
    directionButtons.forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function updateScoreDisplay() {
    scoreDisplay.textContent = `Score: ${score}`;
  }

  function updateHighScoreDisplay() {
    highScoreDisplay.textContent = `Your high score: ${highScore}`;
    const cutoff = leaderboardEntries.length >= LEADERBOARD_LIMIT
      ? leaderboardEntries[LEADERBOARD_LIMIT - 1].score
      : null;
    eligibilityHint.textContent = !leaderboardLoaded
      ? "The leaderboard must load before a score can be submitted."
      : cutoff === null
        ? "A score can be submitted while the leaderboard has an open place."
        : `Your high score must be at least ${cutoff} to qualify for the leaderboard.`;
    submitButton.disabled = submitting || !leaderboardLoaded || highScore < 1 ||
      !nameInput.value.trim() || (cutoff !== null && highScore < cutoff);
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error-message", isError);
  }

  function setSubmitStatus(message, isError = false) {
    submitStatus.textContent = message;
    submitStatus.classList.toggle("error-message", isError);
  }

  function updateHighScore(value) {
    if (value <= highScore) {
      return;
    }
    highScore = value;
    updateHighScoreDisplay();
    try {
      window.localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    } catch (error) {
      console.error("Could not save the Arrow Game high score:", error);
      setSubmitStatus("Your high score could not be saved in this browser.", true);
    }
  }

  try {
    const storedHighScore = Number(window.localStorage.getItem(HIGH_SCORE_KEY));
    if (Number.isSafeInteger(storedHighScore) && storedHighScore > 0) {
      highScore = storedHighScore;
    }
  } catch (error) {
    console.error("Could not read the Arrow Game high score:", error);
  }
  updateHighScoreDisplay();

  function renderLeaderboard() {
    tableBody.replaceChildren();
    if (!leaderboardEntries.length) {
      leaderboardStatus.textContent = "No scores have been submitted yet.";
      leaderboardStatus.hidden = false;
    } else {
      leaderboardStatus.hidden = true;
      const rows = leaderboardEntries.map((entry, index) => {
        const row = document.createElement("tr");
        row.appendChild(createElement("td", "", String(index + 1)));
        const imageCell = document.createElement("td");
        if (entry.image) {
          const image = createElement("img", "arrow-leaderboard-avatar");
          image.src = entry.image;
          image.alt = `${entry.name}'s picture`;
          imageCell.appendChild(image);
        } else {
          imageCell.appendChild(createElement("span", "", "—"));
        }
        row.appendChild(imageCell);
        row.appendChild(createElement("td", "", entry.name));
        row.appendChild(createElement("td", "", String(entry.score)));
        const submittedAt = new Date(entry.submittedAt);
        const dateCell = document.createElement("td");
        dateCell.textContent = submittedAt.toLocaleDateString();
        row.appendChild(dateCell);
        const timeCell = document.createElement("td");
        timeCell.textContent = submittedAt.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit"
        });
        row.appendChild(timeCell);
        return row;
      });
      tableBody.replaceChildren(...rows);
    }
    updateHighScoreDisplay();
  }

  onSnapshot(leaderboardRef, (snapshot) => {
    try {
      leaderboardEntries = snapshot.exists()
        ? readEntries(snapshot.data().entries)
        : [];
      leaderboardLoaded = true;
      renderLeaderboard();
    } catch (error) {
      console.error("Could not read the Arrow Game leaderboard:", error);
      leaderboardLoaded = false;
      leaderboardStatus.textContent = "The leaderboard data is invalid and could not be displayed.";
      leaderboardStatus.hidden = false;
      updateHighScoreDisplay();
    }
  }, (error) => {
    console.error("Could not load the Arrow Game leaderboard:", error);
    leaderboardLoaded = false;
    leaderboardStatus.textContent = "The leaderboard could not be loaded. Check the Firebase Firestore read rules.";
    leaderboardStatus.hidden = false;
    updateHighScoreDisplay();
  });

  function renderCurrentView(viewName) {
    activeView = views.has(viewName) ? viewName : "game";
    views.forEach((view, name) => {
      view.hidden = name !== activeView;
    });
    gameNav.querySelectorAll("a[data-game-view]").forEach((link) => {
      if (link.dataset.gameView === activeView) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  async function loadHowToPlay() {
    if (howToLoading || howToLoaded) {
      return;
    }
    howToLoading = true;
    try {
      const response = await fetch("how-to-play-arrows.md");
      if (!response.ok) {
        throw new Error(`Could not load how-to-play-arrows.md (${response.status}).`);
      }
      const markdown = await response.text();
      if (!markdown.trim()) {
        throw new Error("how-to-play-arrows.md is empty.");
      }
      const content = createElement("div", "markdown-body");
      content.innerHTML = markdownToHtml(markdown);
      howToView.appendChild(content);
      howToLoaded = true;
    } catch (error) {
      console.error("Could not load Arrow Game instructions:", error);
      const message = createElement("p", "arrow-game-empty", error.message || "The instructions could not be loaded.");
      howToView.appendChild(message);
    } finally {
      howToLoading = false;
    }
  }

  function showGameMode() {
    document.body.classList.add("game-mode");
    root.hidden = false;
    siteNav.hidden = true;
    gameNav.hidden = false;
  }

  function pauseRound() {
    Object.values(gameAudio).forEach((audio) => audio.pause());
    activeBeepAudios.forEach((audio) => audio.pause());
    phase = "idle";
    sequence = [];
    inputIndex = 0;
    setDirectionButtonsEnabled(false);
    scoreDisplay.hidden = true;
    startButton.hidden = false;
    startButton.disabled = false;
    startButton.textContent = "Start Game";
    setStatus("Press Start Game to begin.");
  }

  function navigate(viewName) {
    const nextView = views.has(viewName) ? viewName : "game";
    if (currentView === "game" && nextView !== "game") {
      pauseRound();
    }
    currentView = nextView;
    showGameMode();
    renderCurrentView(nextView);
    if (nextView === "how-to-play") {
      loadHowToPlay();
    }
    if (window.location.hash.slice(1) !== nextView) {
      window.location.hash = nextView;
    }
  }

  function close() {
    if (!document.body.classList.contains("game-mode")) {
      return;
    }
    pauseRound();
    currentView = "";
    document.body.classList.remove("game-mode");
    root.hidden = true;
    gameNav.hidden = true;
    siteNav.hidden = false;
  }

  const returnLink = createElement("a", "", "return to blog");
  returnLink.href = "#home";
  returnLink.addEventListener("click", (event) => {
    event.preventDefault();
    onReturnToBlog();
  });
  gameNav.appendChild(returnLink);
  [
    ["game", "game"],
    ["how-to-play", "how to play"],
    ["leaderboard", "leaderboard"]
  ].forEach(([viewName, label]) => {
    const divider = createElement("span", "game-nav-divider", "|");
    divider.setAttribute("aria-hidden", "true");
    gameNav.appendChild(divider);
    const link = createElement("a", "", label);
    link.href = `#${viewName}`;
    link.dataset.gameView = viewName;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(viewName);
    });
    gameNav.appendChild(link);
  });

  function addEntrance(container) {
    const button = createElement("button", "about-game-link");
    button.type = "button";
    button.setAttribute("aria-label", "Open the secret Arrow Game");
    const image = createElement("img");
    image.src = "assets/arrow.png";
    image.alt = "";
    button.appendChild(image);
    button.addEventListener("click", () => navigate("game"));
    container.appendChild(button);
  }

  async function playSequence() {
    phase = "saying";
    setDirectionButtonsEnabled(false);
    for (const direction of sequence) {
      if (phase !== "saying") {
        return;
      }
      const button = directionButtons.get(direction);
      button.classList.add("lit");
      try {
        gameAudio[direction].playbackRate = Math.min(
          1 + score * DIRECTION_SPEED_INCREMENT,
          MAX_DIRECTION_PLAYBACK_RATE
        );
        await playAudio(gameAudio[direction]);
      } catch (error) {
        console.error(`Could not play the ${direction} direction sound:`, error);
        button.classList.remove("lit");
        phase = "over";
        startButton.hidden = false;
        startButton.disabled = false;
        startButton.textContent = "Play Again";
        setStatus("A direction sound could not be played. Press Play Again to retry.", true);
        return;
      }
      button.classList.remove("lit");
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    if (phase === "saying") {
      inputIndex = 0;
      phase = "awaiting";
      setDirectionButtonsEnabled(true);
      setStatus("Your turn. Repeat the sequence.");
    }
  }

  function playBeep() {
    const audio = new Audio("assets/beep.mp3");
    activeBeepAudios.add(audio);
    const cleanup = () => {
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("pause", cleanup);
      audio.removeEventListener("error", onError);
      activeBeepAudios.delete(audio);
    };
    const onError = () => {
      cleanup();
      console.error("Could not play the Arrow Game button sound.");
      if (phase === "awaiting") {
        setStatus("The button sound could not be played.", true);
      }
    };

    audio.addEventListener("ended", cleanup);
    audio.addEventListener("pause", cleanup);
    audio.addEventListener("error", onError);
    try {
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch((error) => {
          cleanup();
          console.error("Could not play the Arrow Game button sound:", error);
          if (phase === "awaiting") {
            setStatus("The button sound could not be played.", true);
          }
        });
      }
    } catch (error) {
      cleanup();
      console.error("Could not play the Arrow Game button sound:", error);
      if (phase === "awaiting") {
        setStatus("The button sound could not be played.", true);
      }
    }
  }

  function handleDirectionInput(direction) {
    if (phase !== "awaiting") {
      return;
    }
    playBeep();
    if (sequence[inputIndex] !== direction) {
      phase = "over";
      setDirectionButtonsEnabled(false);
      startButton.hidden = false;
      startButton.disabled = false;
      startButton.textContent = "Play Again";
      setStatus(`Game over! Your score is ${score}.`, false);
      return;
    }

    inputIndex += 1;
    if (inputIndex === sequence.length) {
      score += 1;
      updateScoreDisplay();
      updateHighScore(score);
      sequence.push(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]);
      setStatus("Correct! Listen to the next sequence.");
      playSequence();
    }
  }

  startButton.addEventListener("click", () => {
    if (phase === "saying" || phase === "awaiting") {
      return;
    }
    score = 0;
    inputIndex = 0;
    sequence = [DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]];
    updateScoreDisplay();
    scoreDisplay.hidden = false;
    startButton.hidden = true;
    setStatus("Listen carefully...");
    playSequence();
  });

  window.addEventListener("keydown", (event) => {
    const direction = directionsForKeyboard[event.key];
    if (!direction || !document.body.classList.contains("game-mode") || activeView !== "game") {
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    event.preventDefault();
    handleDirectionInput(direction);
  });

  nameInput.addEventListener("input", updateHighScoreDisplay);
  submissionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!submissionForm.reportValidity() || submitButton.disabled) {
      return;
    }
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    submitting = true;
    updateHighScoreDisplay();
    setSubmitStatus("");
    try {
      const image = await resizeImageToBase64(imageInput.files[0]);
      const entry = {
        name,
        score: highScore,
        image,
        submittedAt: new Date().toISOString()
      };
      const submitted = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(leaderboardRef);
        const entries = snapshot.exists()
          ? readEntries(snapshot.data().entries)
          : [];
        const cutoff = entries.length >= LEADERBOARD_LIMIT
          ? entries[LEADERBOARD_LIMIT - 1].score
          : null;
        if (entry.score < 1 || (cutoff !== null && entry.score < cutoff)) {
          return false;
        }
        const updatedEntries = sortEntries([...entries, entry]).slice(0, LEADERBOARD_LIMIT);
        const isOnLeaderboard = updatedEntries.some((item) =>
          item.name === entry.name &&
          item.score === entry.score &&
          item.submittedAt === entry.submittedAt
        );
        if (!isOnLeaderboard) {
          return false;
        }
        transaction.set(leaderboardRef, { entries: updatedEntries });
        return true;
      });
      if (!submitted) {
        setSubmitStatus("That score did not make the top 10. Try for a higher score.", true);
      } else {
        submissionForm.reset();
        setSubmitStatus("Your high score was submitted.");
      }
    } catch (error) {
      console.error("Could not submit the Arrow Game high score:", error);
      setSubmitStatus(error.message || "Your score could not be submitted. Check the Firebase Firestore write rules.", true);
    } finally {
      submitting = false;
      updateHighScoreDisplay();
    }
  });

  return {
    addEntrance,
    close,
    navigate
  };
}
