import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://uxpotyibxtuujzgomtyf.supabase.co";
const SUPABASE_KEY = "sb_publishable_JczL81OFzdd9MQhpYr7JQw_Zw1tbLNf";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

const auth = $("auth");
const app = $("app");
const authForm = $("authForm");
const authMode = $("authMode");
const authSubmit = $("authSubmit");
const authMsg = $("authMsg");
const email = $("email");
const password = $("password");
const username = $("username");
const view = $("view");
const theme = $("theme");
const logout = $("logout");

let signupMode = false;
let currentUser = null;
let currentProfile = null;
let profilesCache = [];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeAgo(date) {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );

  if (seconds < 60) return "همین الان";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} دقیقه پیش`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ساعت پیش`;

  return `${Math.floor(seconds / 86400)} روز پیش`;
}

function setMessage(message, error = false) {
  authMsg.textContent = message;
  authMsg.style.color = error ? "#e06c75" : "";
}

function setTheme(value) {
  document.documentElement.dataset.theme = value;
  localStorage.setItem("social-core-theme", value);
}

setTheme(localStorage.getItem("social-core-theme") || "dark");

theme.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === "dark" ? "light" : "dark");
});

authMode.addEventListener("click", () => {
  signupMode = !signupMode;

  username.hidden = !signupMode;
  username.required = signupMode;

  authSubmit.textContent = signupMode
    ? "ساخت حساب"
    : "ورود";

  authMode.textContent = signupMode
    ? "قبلاً حساب دارم"
    : "ساخت حساب جدید";

  setMessage("");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  setMessage("لطفاً صبر کنید...");
  authSubmit.disabled = true;

  try {
    if (signupMode) {
      const cleanUsername = username.value.trim();

      if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
        throw new Error(
          "نام کاربری باید ۳ تا ۲۴ کاراکتر و فقط شامل حروف انگلیسی، عدد یا _ باشد."
        );
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: password.value,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanUsername
          }
        }
      });

      if (error) throw error;

      if (!data.session) {
        setMessage(
          "حساب ساخته شد. اگر تأیید ایمیل فعال باشد، ایمیل خود را تأیید کنید و سپس وارد شوید."
        );
      } else {
        await enterApp(data.user);
      }
    } else {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.value.trim(),
          password: password.value
        });

      if (error) throw error;

      await enterApp(data.user);
    }
  } catch (error) {
    setMessage(
      error?.message || "خطایی رخ داد.",
      true
    );
  } finally {
    authSubmit.disabled = false;
  }
});

logout.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
  });
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    await enterApp(session.user);
  } else {
    currentUser = null;
    currentProfile = null;

    app.hidden = true;
    auth.hidden = false;
  }
});

async function enterApp(user) {
  currentUser = user;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    setMessage(error.message, true);
    return;
  }

  currentProfile = data;

  auth.hidden = true;
  app.hidden = false;

  await showView("feed");
}

async function showView(name) {
  if (!currentUser) return;

  if (name === "feed") {
    await renderFeed();
  }

  if (name === "explore") {
    await renderExplore();
  }

  if (name === "profile") {
    await renderProfile();
  }

  if (name === "notifications") {
    await renderNotifications();
  }
}

async function getProfiles(ids = []) {
  if (!ids.length) return new Map();

  const { data } = await supabase
    .from("profiles")
    .select("id,username,display_name,bio")
    .in("id", ids);

  return new Map(
    (data || []).map((profile) => [
      profile.id,
      profile
    ])
  );
}

async function getFollowingIds() {
  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUser.id);

  return (data || []).map(
    (row) => row.following_id
  );
}

async function renderFeed() {
  view.innerHTML = `
    <div class="card">
      <p class="muted">در حال بارگذاری...</p>
    </div>
  `;

  const following = await getFollowingIds();

  const authorIds = [
    currentUser.id,
    ...following
  ];

  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id,author_id,content,created_at"
    )
    .in("author_id", authorIds)
    .order("created_at", {
      ascending: false
    })
    .limit(50);

  if (error) {
    view.innerHTML = `
      <div class="card">
        ${escapeHtml(error.message)}
      </div>
    `;
    return;
  }

  const profiles = await getProfiles(
    [
      ...new Set(
        (posts || []).map(
          (post) => post.author_id
        )
      )
    ]
  );

  const html = (posts || [])
    .map((post) =>
      renderPost(
        post,
        profiles.get(post.author_id)
      )
    )
    .join("");

  view.innerHTML = `
    <section class="card">
      <h2>خانه</h2>

      <form id="postForm">
        <textarea
          id="postContent"
          maxlength="1000"
          placeholder="چه خبر؟"
          required
        ></textarea>

        <button type="submit">
          انتشار
        </button>
      </form>
    </section>

    ${
      html ||
      `<div class="empty">
        هنوز پستی وجود ندارد.
      </div>`
    }
  `;

  $("postForm").addEventListener(
    "submit",
    createPost
  );

  attachPostActions();
}

function renderPost(post, profile) {
  const name =
    profile?.display_name ||
    profile?.username ||
    "کاربر";

  const usernameText =
    profile?.username
      ? `@${profile.username}`
      : "";

  return `
    <article
      class="card post"
      data-post-id="${escapeHtml(post.id)}"
    >
      <div class="row">
        <div>
          <strong>
            ${escapeHtml(name)}
          </strong>

          <small>
            ${escapeHtml(usernameText)}
            ·
            ${escapeHtml(
              timeAgo(post.created_at)
            )}
          </small>
        </div>
      </div>

      <p class="postText">
        ${escapeHtml(post.content)}
      </p>

      <div class="actions">
        <button data-action="like">
          پسندیدن
        </button>

        <button data-action="comments">
          نظرات
        </button>
      </div>

      <div
        class="comments"
        data-comments
      ></div>
    </article>
  `;
}

function attachPostActions() {
  document
    .querySelectorAll(".post")
    .forEach((postElement) => {
      const postId =
        postElement.dataset.postId;

      const likeButton =
        postElement.querySelector(
          '[data-action="like"]'
        );

      const commentsButton =
        postElement.querySelector(
          '[data-action="comments"]'
        );

      likeButton.addEventListener(
        "click",
        async () => {
          const { data: existing } =
            await supabase
              .from("likes")
              .select("post_id")
              .eq("post_id", postId)
              .eq(
                "user_id",
                currentUser.id
              )
              .maybeSingle();

          if (existing) {
            await supabase
              .from("likes")
              .delete()
              .eq("post_id", postId)
              .eq(
                "user_id",
                currentUser.id
              );

            likeButton.textContent =
              "پسندیدن";
          } else {
            const { error } =
              await supabase
                .from("likes")
                .insert({
                  post_id: postId,
                  user_id: currentUser.id
                });

            if (!error) {
              likeButton.textContent =
                "پسند شد";
            }
          }
        }
      );

      commentsButton.addEventListener(
        "click",
        () => {
          loadComments(
            postElement,
            postId
          );
        }
      );
    });
}

async function loadComments(
  postElement,
  postId
) {
  const container =
    postElement.querySelector(
      "[data-comments]"
    );

  if (container.dataset.loaded === "true") {
    container.innerHTML = "";
    container.dataset.loaded = "false";
    return;
  }

  container.innerHTML = `
    <p class="muted">
      در حال بارگذاری نظرات...
    </p>
  `;

  const {
    data: comments,
    error
  } = await supabase
    .from("comments")
    .select(
      "id,author_id,content,created_at"
    )
    .eq("post_id", postId)
    .order("created_at", {
      ascending: true
    });

  if (error) {
    container.innerHTML = `
      <p class="muted">
        ${escapeHtml(error.message)}
      </p>
    `;
    return;
  }

  const profiles = await getProfiles(
    [
      ...new Set(
        (comments || []).map(
          (comment) =>
            comment.author_id
        )
      )
    ]
  );

  container.innerHTML = `
    ${
      (comments || [])
        .map((comment) => {
          const profile =
            profiles.get(
              comment.author_id
            );

          return `
            <div class="comment">
              <strong>
                ${escapeHtml(
                  profile?.display_name ||
                  profile?.username ||
                  "کاربر"
                )}
              </strong>

              <small>
                ${escapeHtml(
                  timeAgo(
                    comment.created_at
                  )
                )}
              </small>

              <div>
                ${escapeHtml(
                  comment.content
                )}
              </div>
            </div>
          `;
        })
        .join("")
    }

    <form class="commentForm">
      <input
        maxlength="500"
        placeholder="نظر شما..."
        required
      >

      <button type="submit">
        ارسال
      </button>
    </form>
  `;

  container.dataset.loaded = "true";

  container
    .querySelector(".commentForm")
    .addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const input =
          event.currentTarget.querySelector(
            "input"
          );

        const content =
          input.value.trim();

        if (!content) return;

        const { error: insertError } =
          await supabase
            .from("comments")
            .insert({
              post_id: postId,
              author_id: currentUser.id,
              content
            });

        if (insertError) {
          alert(insertError.message);
          return;
        }

        container.dataset.loaded =
          "false";

        await loadComments(
          postElement,
          postId
        );
      }
    );
}

async function createPost(event) {
  event.preventDefault();

  const content =
    $("postContent").value.trim();

  if (!content) return;

  const { error } =
    await supabase
      .from("posts")
      .insert({
        author_id: currentUser.id,
        content
      });

  if (error) {
    alert(error.message);
    return;
  }

  await renderFeed();
}

async function renderExplore() {
  view.innerHTML = `
    <section class="card">
      <h2>کاوش</h2>

      <input
        id="profileSearch"
        placeholder="جستجوی نام کاربری یا نام نمایشی..."
      >
    </section>

    <div id="profileResults"></div>
  `;

  await loadProfiles();

  $("profileSearch").addEventListener(
    "input",
    () => {
      renderProfileResults(
        $("profileSearch")
          .value
          .trim()
          .toLowerCase()
      );
    }
  );
}

async function loadProfiles() {
  const {
    data,
    error
  } = await supabase
    .from("profiles")
    .select(
      "id,username,display_name,bio"
    )
    .order("created_at", {
      ascending: false
    })
    .limit(100);

  if (error) {
    $("profileResults").innerHTML = `
      <div class="card">
        ${escapeHtml(error.message)}
      </div>
    `;
    return;
  }

  profilesCache = data || [];

  renderProfileResults("");
}

function renderProfileResults(query) {
  const filtered =
    profilesCache.filter(
      (profile) => {
        const text =
          `${profile.username} ${profile.display_name}`
            .toLowerCase();

        return text.includes(query);
      }
    );

  $("profileResults").innerHTML =
    filtered
      .map(
        (profile) => `
          <article class="card">
            <strong>
              ${escapeHtml(
                profile.display_name
              )}
            </strong>

            <small>
              @${escapeHtml(
                profile.username
              )}
            </small>

            <p class="muted">
              ${escapeHtml(
                profile.bio || ""
              )}
            </p>

            ${
              profile.id ===
              currentUser.id
                ? `
                  <small>
                    پروفایل شما
                  </small>
                `
                : `
                  <button
                    data-follow-id="${escapeHtml(
                      profile.id
                    )}"
                  >
                    دنبال کردن
                  </button>
                `
            }
          </article>
        `
      )
      .join("") ||
    `
      <div class="empty">
        کاربری پیدا نشد.
      </div>
    `;

  document
    .querySelectorAll(
      "[data-follow-id]"
    )
    .forEach((button) => {
      checkFollowState(
        button.dataset.followId,
        button
      );

      button.addEventListener(
        "click",
        () => {
          toggleFollow(
            button.dataset.followId,
            button
          );
        }
      );
    });
}

async function checkFollowState(
  targetId,
  button
) {
  const { data: existing } =
    await supabase
      .from("follows")
      .select("follower_id")
      .eq(
        "follower_id",
        currentUser.id
      )
      .eq(
        "following_id",
        targetId
      )
      .maybeSingle();

  button.textContent = existing
    ? "لغو دنبال کردن"
    : "دنبال کردن";
}

async function toggleFollow(
  targetId,
  button
) {
  const { data: existing } =
    await supabase
      .from("follows")
      .select("follower_id")
      .eq(
        "follower_id",
        currentUser.id
      )
      .eq(
        "following_id",
        targetId
      )
      .maybeSingle();

  if (existing) {
    const { error } =
      await supabase
        .from("follows")
        .delete()
        .eq(
          "follower_id",
          currentUser.id
        )
        .eq(
          "following_id",
          targetId
        );

    if (!error) {
      button.textContent =
        "دنبال کردن";
    }
  } else {
    const { error } =
      await supabase
        .from("follows")
        .insert({
          follower_id: currentUser.id,
          following_id: targetId
        });

    if (!error) {
      button.textContent =
        "لغو دنبال کردن";
    } else {
      alert(error.message);
    }
  }
}

async function renderProfile() {
  const {
    data: profile,
    error
  } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    view.innerHTML = `
      <div class="card">
        ${escapeHtml(error.message)}
      </div>
    `;
    return;
  }

  currentProfile = profile;

  view.innerHTML = `
    <section class="card">
      <h2>پروفایل</h2>

      <form id="profileForm">

        <label>
          نام کاربری
        </label>

        <input
          value="${escapeHtml(
            profile.username
          )}"
          disabled
        >

        <label>
          نام نمایشی
        </label>

        <input
          id="displayName"
          maxlength="60"
          value="${escapeHtml(
            profile.display_name
          )}"
          required
        >

        <label>
          درباره من
        </label>

        <textarea
          id="bio"
          maxlength="280"
        >${escapeHtml(
          profile.bio || ""
        )}</textarea>

        <button type="submit">
          ذخیره تغییرات
        </button>

      </form>
    </section>
  `;

  $("profileForm").addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const displayName =
        $("displayName")
          .value
          .trim();

      const bio =
        $("bio")
          .value
          .trim();

      const {
        error: updateError
      } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          bio
        })
        .eq(
          "id",
          currentUser.id
        );

      if (updateError) {
        alert(
          updateError.message
        );
        return;
      }

      currentProfile.display_name =
        displayName;

      currentProfile.bio = bio;

      alert(
        "پروفایل ذخیره شد."
      );
    }
  );
}

async function renderNotifications() {
  const {
    data: notifications,
    error
  } = await supabase
    .from("notifications")
    .select(
      "id,actor_id,type,reference_id,read_at,created_at"
    )
    .eq(
      "recipient_id",
      currentUser.id
    )
    .order("created_at", {
      ascending: false
    })
    .limit(50);

  if (error) {
    view.innerHTML = `
      <div class="card">
        ${escapeHtml(error.message)}
      </div>
    `;
    return;
  }

  const profiles =
    await getProfiles(
      [
        ...new Set(
          (notifications || [])
            .map(
              (notification) =>
                notification.actor_id
            )
            .filter(Boolean)
        )
      ]
    );

  view.innerHTML = `
    <section class="card">
      <h2>اعلان‌ها</h2>
    </section>

    ${
      (notifications || [])
        .map((notification) => {
          const actor =
            profiles.get(
              notification.actor_id
            );

          let text;

          if (
            notification.type ===
            "follow"
          ) {
            text =
              "شما را دنبال کرد.";
          } else if (
            notification.type ===
            "like"
          ) {
            text =
              "پست شما را پسندید.";
          } else {
            text =
              "برای پست شما نظر گذاشت.";
          }

          return `
            <article
              class="card ${
                notification.read_at
                  ? ""
                  : "unread"
              }"
            >
              <strong>
                ${escapeHtml(
                  actor?.display_name ||
                  actor?.username ||
                  "کاربر"
                )}
              </strong>

              <span>
                ${escapeHtml(text)}
              </span>

              <small>
                ${escapeHtml(
                  timeAgo(
                    notification.created_at
                  )
                )}
              </small>
            </article>
          `;
        })
        .join("") ||
      `
        <div class="empty">
          اعلانی ندارید.
        </div>
      `
    }
  `;

  await supabase
    .from("notifications")
    .update({
      read_at:
        new Date().toISOString()
    })
    .eq(
      "recipient_id",
      currentUser.id
    )
    .is(
      "read_at",
      null
    );
  }
