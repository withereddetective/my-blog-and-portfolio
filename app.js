import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD72WsuS9_Qpus_s5cX7agQ7InvoECnRDM",
  authDomain: "blog-website-a967e.firebaseapp.com",
  projectId: "blog-website-a967e",
  storageBucket: "blog-website-a967e.firebasestorage.app",
  messagingSenderId: "529049077740",
  appId: "1:529049077740:web:a7c109a604e23fd9fde2c9",
  measurementId: "G-CX2RW2GRPW"
};

const db = getFirestore(initializeApp(firebaseConfig));
const navLinks = document.querySelectorAll(".nav-link");
const tabContents = document.querySelectorAll(".tab-content");

function switchTab(tabName) {
  const tabExists = Array.from(tabContents).some((tab) => tab.id === `tab-${tabName}`);
  const activeTab = tabExists ? tabName : "home";

  navLinks.forEach((link) => {
    const active = link.dataset.tab === activeTab;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  tabContents.forEach((tab) => {
    tab.classList.toggle("active", tab.id === `tab-${activeTab}`);
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.hash = link.dataset.tab;
    switchTab(link.dataset.tab);
  });
});

window.addEventListener("hashchange", () => {
  switchTab(window.location.hash.slice(1));
});
switchTab(window.location.hash.slice(1) || "home");

function markdownToHtml(markdown) {
  if (!window.marked || typeof window.marked.parse !== "function") {
    throw new Error("The Markdown renderer did not load. Check your internet connection and reload.");
  }
  return window.marked.parse(markdown);
}

function showMessage(container, message, isError = false) {
  const notice = document.createElement("p");
  notice.className = isError ? "site-message error-message" : "site-message";
  notice.setAttribute("role", isError ? "alert" : "status");
  notice.textContent = message;
  container.replaceChildren(notice);
}

async function loadAbout() {
  const container = document.getElementById("tab-about");
  try {
    const response = await fetch("about.md");
    if (!response.ok) {
      throw new Error(`Could not load about.md (${response.status}).`);
    }
    const markdown = await response.text();
    const card = document.createElement("article");
    card.className = "card markdown-body";
    card.innerHTML = markdownToHtml(markdown);
    container.replaceChildren(card);
  } catch (error) {
    console.error("Could not load the about page:", error);
    showMessage(container, error.message || "Could not load the about page.", true);
  }
}

async function loadProjects(jsonFile, containerId) {
  const container = document.getElementById(containerId);
  try {
    const response = await fetch(jsonFile);
    if (!response.ok) {
      throw new Error(`Could not load ${jsonFile} (${response.status}).`);
    }
    const items = await response.json();
    if (!Array.isArray(items)) {
      throw new Error(`${jsonFile} must contain a JSON array.`);
    }

    const cards = items.map((item) => {
      if (!item || typeof item.content !== "string") {
        throw new Error(`${jsonFile} contains an entry without Markdown content.`);
      }
      const card = document.createElement("article");
      card.className = "card markdown-body";
      card.innerHTML = markdownToHtml(item.content);
      return card;
    });
    container.replaceChildren(...cards);
    if (cards.length === 0) {
      showMessage(container, "Nothing to show here yet.");
    }
  } catch (error) {
    console.error(`Could not load ${jsonFile}:`, error);
    showMessage(container, error.message || `Could not load ${jsonFile}.`, true);
  }
}

function resizeImageToBase64(file) {
  if (!file) {
    return Promise.resolve(null);
  }
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Choose an image file for your avatar."));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("Avatar images must be 8 MB or smaller."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("The selected file is not a readable image."));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser could not process the selected image."));
          return;
        }
        context.drawImage(image, 0, 0, 64, 64);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function addAudioPlayer(post, header) {
  if (typeof post.audio !== "string" || !post.audio) {
    return;
  }

  const player = document.createElement("div");
  player.className = "custom-audio-player";
  const audio = document.createElement("audio");
  audio.src = post.audio;
  audio.preload = "metadata";
  audio.loop = true;

  const playButton = document.createElement("button");
  playButton.className = "play-pause-btn";
  playButton.type = "button";
  playButton.textContent = "▶";
  playButton.setAttribute("aria-label", `Play audio for ${post.title}`);

  const playbackIndicator = document.createElement("img");
  playbackIndicator.className = "playback-indicator";
  playbackIndicator.src = "assets/music.gif";
  playbackIndicator.alt = "Music playing";
  playbackIndicator.hidden = true;

  const volumeIcon = document.createElement("span");
  volumeIcon.className = "volume-icon";
  volumeIcon.setAttribute("aria-hidden", "true");
  volumeIcon.textContent = "🔊";

  const volumeSlider = document.createElement("input");
  volumeSlider.className = "volume-slider";
  volumeSlider.type = "range";
  volumeSlider.min = "0";
  volumeSlider.max = "1";
  volumeSlider.step = "0.01";
  volumeSlider.value = "1";
  volumeSlider.setAttribute("aria-label", "Volume");

  const errorMessage = document.createElement("span");
  errorMessage.className = "audio-error";
  errorMessage.setAttribute("role", "status");

  player.append(audio, playButton, playbackIndicator, volumeIcon, volumeSlider, errorMessage);
  header.appendChild(player);

  const updatePlayButton = () => {
    const isPlaying = !audio.paused;
    playButton.textContent = isPlaying ? "❚❚" : "▶";
    playButton.setAttribute("aria-label", `${isPlaying ? "Pause" : "Play"} audio for ${post.title}`);
    playbackIndicator.hidden = !isPlaying;
  };
  playButton.addEventListener("click", async () => {
    errorMessage.textContent = "";
    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        console.error("Could not play post audio:", error);
        errorMessage.textContent = "Audio could not be played.";
      }
    } else {
      audio.pause();
    }
    updatePlayButton();
  });
  audio.addEventListener("play", updatePlayButton);
  audio.addEventListener("pause", updatePlayButton);
  audio.addEventListener("ended", updatePlayButton);
  volumeSlider.addEventListener("input", () => {
    audio.volume = Number(volumeSlider.value);
    const percent = Number(volumeSlider.value) * 100;
    volumeSlider.style.background = `linear-gradient(to right, #0075ff ${percent}%, #e5e7eb ${percent}%)`;
  });
}

function renderComments(postId, list) {
  const commentsQuery = query(collection(db, "comments"), where("postId", "==", postId));
  onSnapshot(commentsQuery, (snapshot) => {
    const comments = snapshot.docs
      .map((commentDoc) => commentDoc.data())
      .sort((a, b) => {
        const first = a.createdAt?.toMillis?.() ?? 0;
        const second = b.createdAt?.toMillis?.() ?? 0;
        return first - second;
      });

    const commentElements = comments.map((comment) => {
      const item = document.createElement("article");
      item.className = "comment-item";
      const authorRow = document.createElement("div");
      authorRow.className = "comment-author-row";
      if (typeof comment.image === "string" && comment.image.startsWith("data:image/")) {
        const avatar = document.createElement("img");
        avatar.src = comment.image;
        avatar.className = "comment-avatar";
        avatar.alt = "";
        authorRow.appendChild(avatar);
      }
      const author = document.createElement("span");
      author.className = "comment-author-name";
      author.textContent = typeof comment.author === "string" && comment.author.trim()
        ? comment.author
        : "anonymous";
      authorRow.appendChild(author);
      const body = document.createElement("div");
      body.className = "comment-body";
      body.textContent = typeof comment.body === "string" ? comment.body : "";
      item.append(authorRow, body);
      return item;
    });
    list.replaceChildren(...commentElements);
  }, (error) => {
    console.error(`Could not load comments for ${postId}:`, error);
    showMessage(list, "Comments could not be loaded. Check the Firebase Firestore read rules.");
  });
}

function addCommentForm(post, article) {
  const section = document.createElement("section");
  section.className = "comments-section";
  const heading = document.createElement("h3");
  heading.textContent = "Comments";

  const form = document.createElement("form");
  form.className = "comment-form";
  const row = document.createElement("div");
  row.className = "comment-form-row";
  const authorInput = document.createElement("input");
  authorInput.type = "text";
  authorInput.name = "author";
  authorInput.maxLength = 80;
  authorInput.placeholder = "Name (leave blank for anonymous)";
  authorInput.setAttribute("aria-label", "Name");

  const fileLabel = document.createElement("label");
  fileLabel.className = "file-label";
  fileLabel.textContent = "Attach image";
  const avatarInput = document.createElement("input");
  avatarInput.type = "file";
  avatarInput.name = "avatar";
  avatarInput.accept = "image/*";
  avatarInput.setAttribute("aria-label", "Choose an image");
  fileLabel.appendChild(avatarInput);
  row.append(authorInput, fileLabel);

  const bodyInput = document.createElement("textarea");
  bodyInput.name = "body";
  bodyInput.rows = 3;
  bodyInput.maxLength = 5000;
  bodyInput.placeholder = "Write a comment...";
  bodyInput.required = true;
  bodyInput.setAttribute("aria-label", "Comment");

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "Post Comment";
  const status = document.createElement("p");
  status.className = "comment-status";
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "comments-list";

  form.append(row, bodyInput, submitButton, status);
  section.append(heading, form, list);
  article.appendChild(section);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = bodyInput.value.trim();
    if (!body) {
      bodyInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Posting...";
    status.textContent = "";
    status.classList.remove("error-message");

    try {
      const image = await resizeImageToBase64(avatarInput.files[0]);
      await addDoc(collection(db, "comments"), {
        postId: post.id,
        author: authorInput.value.trim() || "anonymous",
        image,
        body,
        createdAt: serverTimestamp()
      });
      form.reset();
      status.textContent = "Your comment was posted.";
    } catch (error) {
      console.error("Could not post comment:", error);
      status.textContent = error.message || "Your comment could not be posted. Check the Firebase Firestore write rules.";
      status.classList.add("error-message");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Post Comment";
    }
  });

  renderComments(post.id, list);
}

async function loadPosts() {
  const container = document.getElementById("tab-home");
  try {
    const response = await fetch("posts.json");
    if (!response.ok) {
      throw new Error(`Could not load posts.json (${response.status}).`);
    }
    const posts = await response.json();
    if (!Array.isArray(posts)) {
      throw new Error("posts.json must contain a JSON array.");
    }

    const cards = posts.map((post) => {
      if (!post || typeof post.id !== "string" || typeof post.title !== "string" ||
          typeof post.content !== "string") {
        throw new Error("posts.json contains a post with invalid or missing fields.");
      }

      const article = document.createElement("article");
      article.className = "card blog-post";
      const header = document.createElement("div");
      header.className = "post-header";
      const title = document.createElement("h2");
      title.className = "post-title";
      title.textContent = post.title;
      header.appendChild(title);
      addAudioPlayer(post, header);
      if (typeof post.date === "string" && post.date) {
        const date = document.createElement("time");
        date.className = "post-date";
        date.dateTime = post.date;
        date.textContent = post.date;
        header.appendChild(date);
      }

      const content = document.createElement("div");
      content.className = "markdown-body";
      content.innerHTML = markdownToHtml(post.content);
      article.append(header, content);
      addCommentForm(post, article);
      return article;
    });

    container.replaceChildren(...cards);
    if (cards.length === 0) {
      showMessage(container, "No posts yet. Check back soon.");
    }
  } catch (error) {
    console.error("Could not load blog posts:", error);
    showMessage(container, error.message || "Could not load blog posts.", true);
  }
}

loadAbout();
loadProjects("current.json", "tab-current");
loadProjects("completed.json", "tab-completed");
loadPosts();
