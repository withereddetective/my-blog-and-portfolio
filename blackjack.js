const SUITS = ["clubs", "diamonds", "hearts", "spades"];
const RANKS = ["A", "02", "03", "04", "05", "06", "07", "08", "09", "10", "J", "Q", "K"];
const DEALER_MODES = ["At Start", "With Player", "At End"];
const CARD_ANIMATION_DURATION = 500;
const CARD_DELAY = CARD_ANIMATION_DURATION;
const INTRO_CARD_COUNT = 40;
const INTRO_FALLBACK_DURATION = 2000;

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

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function calculateScore(hand) {
  let total = hand.reduce((sum, card) => sum + Math.min(card.value, 10), 0);
  let aces = hand.filter((card) => card.value === 1).length;
  while (aces > 0 && total + 10 <= 21) {
    total += 10;
    aces -= 1;
  }
  return total;
}

function createDeck() {
  const deck = SUITS.flatMap((suit) =>
    RANKS.map((rank, index) => ({
      suit,
      rank,
      value: index + 1
    }))
  );
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function setupBlackjackGame({ onReturnToBlog }) {
  const root = document.getElementById("blackjack-root");
  const siteNav = document.getElementById("site-nav");
  const arrowNav = document.getElementById("game-nav");
  const blackjackNav = document.getElementById("blackjack-nav");
  const workspace = createElement("main", "blackjack-workspace");
  const introScreen = createElement("section", "blackjack-intro");
  const introField = createElement("div", "blackjack-intro-field");
  const rulesPanel = createElement("section", "blackjack-panel blackjack-rules");
  const tablePanel = createElement("section", "blackjack-panel blackjack-table");
  let dealerMode = 1;
  let dealerThreshold = 16;
  let deck = [];
  let playerCards = [];
  let dealerCards = [];
  let dealerStood = false;
  let phase = "rules";
  let roundToken = 0;
  let activeSounds = new Set();
  let introPlayed = false;

  const rulesTitle = createElement("h1", "blackjack-title", "BLACKJACK");
  const dealerModeLabel = createElement("p", "blackjack-rules-label", "The dealer should play:");
  const dealerModeGroup = createElement("div", "blackjack-mode-options");
  dealerModeGroup.setAttribute("role", "group");
  dealerModeGroup.setAttribute("aria-label", "Dealer behavior");
  const modeButtons = DEALER_MODES.map((mode, index) => {
    const button = createElement("button", "blackjack-mode-button", mode);
    button.type = "button";
    button.setAttribute("aria-pressed", String(index === dealerMode));
    button.addEventListener("click", () => {
      dealerMode = index;
      modeButtons.forEach((modeButton, modeIndex) => {
        modeButton.setAttribute("aria-pressed", String(modeIndex === dealerMode));
      });
    });
    dealerModeGroup.appendChild(button);
    return button;
  });
  const thresholdLabel = createElement("label", "blackjack-threshold-label", "The dealer has to draw on:");
  const thresholdInput = createElement("input", "blackjack-threshold");
  thresholdInput.type = "number";
  thresholdInput.min = "4";
  thresholdInput.max = "21";
  thresholdInput.step = "1";
  thresholdInput.value = String(dealerThreshold);
  thresholdInput.required = true;
  thresholdInput.setAttribute("aria-label", "Dealer draw threshold");
  thresholdLabel.appendChild(thresholdInput);
  const rulesMessage = createElement("p", "blackjack-rules-message", "Choose how the dealer plays and the score they draw to.");
  const startButton = createElement("button", "blackjack-button blackjack-start", "Start");
  startButton.type = "button";
  rulesPanel.append(rulesTitle, dealerModeLabel, dealerModeGroup, thresholdLabel, rulesMessage, startButton);

  const tableTitle = createElement("h1", "blackjack-title", "BLACKJACK");
  const dealerSection = createElement("section", "blackjack-hand blackjack-dealer-hand");
  const dealerHeading = createElement("h2", "blackjack-hand-heading");
  const dealerCardRow = createElement("div", "blackjack-card-row");
  const dealerStatus = createElement("p", "blackjack-dealer-status");
  dealerSection.append(dealerHeading, dealerCardRow, dealerStatus);
  const deckImage = createElement("img", "blackjack-deck");
  deckImage.src = "bj_assets/card_back_red.png";
  deckImage.alt = "Deck";
  const deckSlot = createElement("div", "blackjack-deck-slot");
  deckSlot.appendChild(deckImage);
  const playerSection = createElement("section", "blackjack-hand blackjack-player-hand");
  const playerHeading = createElement("h2", "blackjack-hand-heading");
  const playerCardRow = createElement("div", "blackjack-card-row");
  playerSection.append(playerHeading, playerCardRow);
  const gameMessage = createElement("p", "blackjack-message");
  gameMessage.setAttribute("role", "status");
  gameMessage.setAttribute("aria-live", "polite");
  const actionButtons = createElement("div", "blackjack-actions");
  const hitButton = createElement("button", "blackjack-button", "Hit");
  hitButton.type = "button";
  const standButton = createElement("button", "blackjack-button", "Stand");
  standButton.type = "button";
  actionButtons.append(hitButton, standButton);
  const resultPanel = createElement("div", "blackjack-result");
  const resultText = createElement("p", "blackjack-result-text");
  const totalsText = createElement("p", "blackjack-totals");
  const resultButtons = createElement("div", "blackjack-actions");
  const playAgainButton = createElement("button", "blackjack-button", "Play Again");
  playAgainButton.type = "button";
  const rulesButton = createElement("button", "blackjack-button blackjack-secondary-button", "Rules");
  rulesButton.type = "button";
  resultButtons.append(playAgainButton, rulesButton);
  resultPanel.append(resultText, totalsText, resultButtons);
  tablePanel.append(tableTitle, dealerSection, deckSlot, playerSection, gameMessage, actionButtons, resultPanel);
  introScreen.appendChild(introField);
  introScreen.hidden = true;
  workspace.append(introScreen, rulesPanel, tablePanel);
  root.replaceChildren(workspace);

  const returnLink = createElement("a", "", "back to blog");
  returnLink.href = "#home";
  returnLink.addEventListener("click", (event) => {
    event.preventDefault();
    onReturnToBlog();
  });
  blackjackNav.replaceChildren(returnLink);

  let introAnimations = [];

  function clearIntro() {
    introAnimations.forEach((animation) => animation.cancel());
    introAnimations = [];
    introField.replaceChildren();
  }

  function showRules() {
    introScreen.hidden = true;
    tablePanel.hidden = true;
    rulesPanel.hidden = false;
  }

  async function playIntro() {
    const token = ++roundToken;
    introScreen.hidden = false;
    rulesPanel.hidden = true;
    tablePanel.hidden = true;
    introField.replaceChildren();

    const introCards = Array.from({ length: INTRO_CARD_COUNT }, (_, index) => {
      const wrapper = createElement("div", "blackjack-intro-card");
      const image = createElement("img");
      image.src = `bj_assets/card_back_${index < INTRO_CARD_COUNT / 2 ? "blue" : "red"}.png`;
      image.alt = "";
      wrapper.appendChild(image);
      introField.appendChild(wrapper);
      return wrapper;
    });
    const field = introField.getBoundingClientRect();
    const cards = introCards.map((wrapper) => {
      const bounds = wrapper.getBoundingClientRect();
      const startX = (field.width - bounds.width) / 2;
      const startY = (field.height - bounds.height) / 2;
      wrapper.style.left = `${startX}px`;
      wrapper.style.top = `${startY}px`;
      return {
        wrapper,
        startX,
        startY,
        endX: startX + (Math.random() - 0.5) * field.width,
        endY: startY + (Math.random() - 0.5) * field.height
      };
    });
    const shuffleAudio = playSound("card_shuffle");
    const halfDuration = (await getAudioDuration(shuffleAudio)) / 2;
    if (token !== roundToken) {
      return;
    }

    const outwardAnimations = cards.map(({ wrapper, startX, startY, endX, endY }) =>
      wrapper.animate([
        { left: `${startX}px`, top: `${startY}px` },
        { left: `${endX}px`, top: `${endY}px` }
      ], {
        duration: halfDuration,
        easing: "cubic-bezier(0.215, 0.61, 0.355, 1)",
        fill: "forwards"
      })
    );
    introAnimations = outwardAnimations;
    await wait(halfDuration);
    if (token !== roundToken) {
      return;
    }

    const returnAnimations = cards.map(({ wrapper, startX, startY, endX, endY }) =>
      wrapper.animate([
        { left: `${endX}px`, top: `${endY}px` },
        { left: `${startX}px`, top: `${startY}px` }
      ], {
        duration: halfDuration,
        easing: "cubic-bezier(0.645, 0.045, 0.355, 1)",
        fill: "forwards"
      })
    );
    outwardAnimations.forEach((animation) => animation.cancel());
    introAnimations = returnAnimations;
    await wait(halfDuration);
    if (token !== roundToken) {
      return;
    }
    clearIntro();
    showRules();
  }

  function playSound(soundName) {
    const audio = new Audio(`bj_assets/${soundName}.mp3`);
    audio.preload = "auto";
    activeSounds.add(audio);
    const cleanup = () => {
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("pause", cleanup);
      audio.removeEventListener("error", onError);
      activeSounds.delete(audio);
    };
    const onError = () => {
      cleanup();
      console.error(`Could not play the Blackjack ${soundName} sound.`);
    };
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("pause", cleanup);
    audio.addEventListener("error", onError);
    try {
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch((error) => {
          cleanup();
          console.error(`Could not play the Blackjack ${soundName} sound:`, error);
        });
      }
    } catch (error) {
      cleanup();
      console.error(`Could not play the Blackjack ${soundName} sound:`, error);
    }
    return audio;
  }

  function getAudioDuration(audio) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      return Promise.resolve(audio.duration * 1000);
    }
    return new Promise((resolve) => {
      let timeout;
      const finish = (duration) => {
        window.clearTimeout(timeout);
        audio.removeEventListener("loadedmetadata", onMetadata);
        audio.removeEventListener("error", onError);
        resolve(duration);
      };
      const onMetadata = () => {
        finish(Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration * 1000
          : INTRO_FALLBACK_DURATION);
      };
      const onError = () => finish(INTRO_FALLBACK_DURATION);
      audio.addEventListener("loadedmetadata", onMetadata, { once: true });
      audio.addEventListener("error", onError, { once: true });
      timeout = window.setTimeout(() => finish(INTRO_FALLBACK_DURATION), 1500);
    });
  }

  function setCardFace(card) {
    if (card.hidden) {
      const redSuit = card.suit === "diamonds" || card.suit === "hearts";
      card.element.src = `bj_assets/card_back_${redSuit ? "red" : "blue"}.png`;
      card.element.alt = "Face-down card";
    } else {
      card.element.src = `bj_assets/card_${card.suit}_${card.rank}.png`;
      card.element.alt = `${card.rank} of ${card.suit}`;
    }
  }

  function animateCardFromDeck(card) {
    const source = deckImage.getBoundingClientRect();
    const destination = card.element.getBoundingClientRect();
    if (!source.width || !destination.width) {
      return;
    }
    const offsetX = source.left + source.width / 2 - destination.left - destination.width / 2;
    const offsetY = source.top + source.height / 2 - destination.top - destination.height / 2;
    card.element.animate([
      {
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${source.width / destination.width})`,
        opacity: 0.8
      },
      { transform: "translate(0, 0) scale(1)", opacity: 1 }
    ], {
      duration: CARD_ANIMATION_DURATION,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)"
    });
  }

  function renderCards(container, hand) {
    const cards = hand.map((card) => {
      if (!card.element) {
        card.element = createElement("img", "blackjack-card");
        setCardFace(card);
      }
      return card.element;
    });
    container.replaceChildren(...cards);
    hand.forEach((card) => {
      if (card.animateFromDeck) {
        animateCardFromDeck(card);
        card.animateFromDeck = false;
      }
    });
  }

  async function flipDealerCards(token) {
    const hiddenCards = dealerCards.filter((card) => card.hidden);
    for (const card of hiddenCards) {
      if (token !== roundToken) {
        return;
      }
      playSound("card_flipped");
      card.element.animate([
        { transform: "scaleX(1) scaleY(1)" },
        { transform: "scaleX(0) scaleY(1.25)", offset: 0.5 },
        { transform: "scaleX(1) scaleY(1)" }
      ], {
        duration: CARD_ANIMATION_DURATION,
        easing: "ease-in-out"
      });
      await wait(CARD_ANIMATION_DURATION / 2);
      if (token !== roundToken) {
        return;
      }
      card.hidden = false;
      setCardFace(card);
      await wait(CARD_ANIMATION_DURATION / 2 + 500);
    }
  }

  function renderTable() {
    const visibleDealerCards = dealerCards.filter((card) => !card.hidden);
    const dealerScore = calculateScore(visibleDealerCards);
    dealerHeading.textContent = visibleDealerCards.length
      ? `Dealer's hand: ${dealerScore}`
      : "Dealer's hand:";
    playerHeading.textContent = `Your hand: ${calculateScore(playerCards)}`;
    renderCards(dealerCardRow, dealerCards);
    renderCards(playerCardRow, playerCards);
    dealerStatus.textContent = dealerMode === 1 && dealerStood && phase === "player"
      ? "STAND!"
      : "";
    gameMessage.textContent = phase === "dealing"
      ? "Dealing..."
      : phase === "dealer"
        ? "Dealer's turn..."
        : phase === "player"
          ? "Your turn"
          : "";
    actionButtons.hidden = phase !== "player";
    hitButton.disabled = phase !== "player";
    standButton.disabled = phase !== "player";
    resultPanel.hidden = phase !== "end";
  }

  function drawFromDeck(hidden = false) {
    const card = deck.pop();
    if (!card) {
      throw new Error("The Blackjack deck is empty.");
    }
    return { ...card, hidden, animateFromDeck: true };
  }

  function setRoundResult() {
    const playerScore = calculateScore(playerCards);
    const dealerScore = calculateScore(dealerCards);
    if (playerScore > 21 && dealerScore > 21) {
      resultText.textContent = "It's a draw! (both bust)";
    } else if (playerScore > 21) {
      resultText.textContent = "You lose! (bust)";
    } else if (dealerScore > 21) {
      resultText.textContent = "You win! (dealer bust)";
    } else if (playerScore > dealerScore) {
      resultText.textContent = "You win!";
    } else if (dealerScore > playerScore) {
      resultText.textContent = "You lose!";
    } else {
      resultText.textContent = "It's a tie!";
    }
    totalsText.textContent = `Your: ${playerScore} | Dealer: ${dealerScore}`;
    phase = "end";
    renderTable();
  }

  async function dealerTurn(token) {
    if (token !== roundToken) {
      return;
    }
    phase = "dealer";
    renderTable();
    await flipDealerCards(token);
    if (token !== roundToken) {
      return;
    }
    renderTable();
    if (dealerMode === 0 || (dealerMode === 1 && calculateScore(dealerCards) >= dealerThreshold)) {
      setRoundResult();
      return;
    }
    while (calculateScore(dealerCards) < dealerThreshold) {
      dealerCards.push(drawFromDeck());
      playSound("card_drawn");
      renderTable();
      await wait(CARD_DELAY);
      if (token !== roundToken) {
        return;
      }
    }
    setRoundResult();
  }

  async function startRound() {
    if (!thresholdInput.reportValidity()) {
      return;
    }
    const threshold = Number(thresholdInput.value);
    if (!Number.isInteger(threshold) || threshold < 4 || threshold > 21) {
      thresholdInput.focus();
      return;
    }
    dealerThreshold = threshold;
    const token = ++roundToken;
    rulesPanel.hidden = true;
    tablePanel.hidden = false;
    deck = createDeck();
    playerCards = [];
    dealerCards = [];
    dealerStood = false;
    phase = "dealing";
    gameMessage.textContent = "Dealing...";
    renderTable();

    const openingDeal = [
      [dealerCards, false],
      [dealerCards, true],
      [playerCards, false],
      [playerCards, false]
    ];
    for (const [hand, hidden] of openingDeal) {
      if (token !== roundToken) {
        return;
      }
      hand.push(drawFromDeck(hidden));
      playSound("card_drawn");
      renderTable();
      await wait(CARD_DELAY);
    }
    if (token !== roundToken) {
      return;
    }
    if (calculateScore(playerCards) === 21) {
      await dealerTurn(token);
      return;
    }
    if (dealerMode === 0) {
      while (calculateScore(dealerCards) < dealerThreshold) {
        dealerCards.push(drawFromDeck(true));
        playSound("card_drawn");
        renderTable();
        await wait(CARD_DELAY);
        if (token !== roundToken) {
          return;
        }
      }
    }
    phase = "player";
    renderTable();
  }

  async function playerHit() {
    if (phase !== "player") {
      return;
    }
    const token = roundToken;
    phase = "dealing";
    playerCards.push(drawFromDeck());
    playSound("card_drawn");
    renderTable();
    await wait(CARD_DELAY);
    if (token !== roundToken) {
      return;
    }
    if (calculateScore(playerCards) >= 21) {
      await dealerTurn(token);
      return;
    }
    if (dealerMode === 1) {
      if (calculateScore(dealerCards) < dealerThreshold) {
        dealerCards.push(drawFromDeck(true));
        playSound("card_drawn");
        renderTable();
        await wait(CARD_DELAY);
        if (token !== roundToken) {
          return;
        }
      }
      dealerStood = calculateScore(dealerCards) >= dealerThreshold;
    }
    phase = "player";
    renderTable();
  }

  startButton.addEventListener("click", startRound);
  hitButton.addEventListener("click", playerHit);
  standButton.addEventListener("click", () => {
    if (phase === "player") {
      dealerTurn(roundToken);
    }
  });
  playAgainButton.addEventListener("click", startRound);
  rulesButton.addEventListener("click", () => {
    phase = "rules";
    tablePanel.hidden = true;
    rulesPanel.hidden = false;
  });

  function open() {
    const alreadyOpen = document.body.classList.contains("blackjack-mode");
    document.body.classList.add("blackjack-mode");
    root.hidden = false;
    siteNav.hidden = true;
    arrowNav.hidden = true;
    blackjackNav.hidden = false;
    if (alreadyOpen) {
      return;
    }
    if (!introPlayed) {
      introPlayed = true;
      playIntro();
    } else {
      showRules();
    }
    if (window.location.hash.slice(1) !== "blackjack") {
      window.location.hash = "blackjack";
    }
  }

  function close() {
    if (!document.body.classList.contains("blackjack-mode")) {
      return;
    }
    roundToken += 1;
    activeSounds.forEach((audio) => audio.pause());
    activeSounds.clear();
    clearIntro();
    phase = "rules";
    tablePanel.hidden = true;
    rulesPanel.hidden = false;
    root.hidden = true;
    blackjackNav.hidden = true;
    siteNav.hidden = false;
    document.body.classList.remove("blackjack-mode");
  }

  tablePanel.hidden = true;
  return { close, open };
}
