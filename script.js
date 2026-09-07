const KEY = "adaptiveTaskScheduler.v2";

let tasks = load(), currentId = null;

function load() {
  let old = localStorage.getItem(KEY);
  return old ? JSON.parse(old) : [];
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}

function ret(days, s) {
  return Math.pow(1 + (19 / 81) * (days / s), -0.5);
}

function diff(d, r) {
  if (d == null) return Math.max(1, Math.min(10, 10 - 2 * (r - 1)));
  return Math.max(1, Math.min(10, d - 0.5 * (r - 3)));
}

function initial(r) {
  return ({ 1: 0.4, 2: 1, 3: 3, 4: 6 })[r] ?? 3;
}

function updated(s, d, rtr, r) {
  if (r === 1) return Math.max(0.5, s * 0.2);
  let df = 11 - d, rf = Math.exp(1 - rtr), boost = ({ 2: 1.2, 3: 1.5, 4: 2 })[r] ?? 1.5;
  return Math.round(s * (1 + 0.1 * df * rf * boost) * 100) / 100;
}

function parse(d) {
  if (!d) return null;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [day, month, year] = d.split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function process(t, r) {
  let now = new Date(), d, s, rr = null;
  if (!t.lastReviewed || t.stability == null) {
    d = diff(null, r);
    s = initial(r);
  } else {
    let elapsed = Math.max(0, Math.floor((now - parse(t.lastReviewed)) / 86400000));
    rr = ret(elapsed, t.stability);
    d = diff(t.difficulty, r);
    s = updated(t.stability, d, rr, r);
  }
  let next = new Date(now.getTime() + s * 86400000);
  return { ...t, difficulty: d, stability: s, retrievability: rr, lastReviewed: fmt(now), nextReview: next.toISOString(), historical: false };
}

function fmt(d) {
  return d.toLocaleDateString("en-GB");
}

function due() {
  const now = Date.now();

  return tasks
    .filter(t => {
      if (!t.nextReview) return true;
      const dueDate = parse(t.nextReview);
      return dueDate !== null && dueDate.getTime() <= now;
    })
    .sort((a, b) => {
      const aHasSchedule = a.stability != null && a.nextReview;
      const bHasSchedule = b.stability != null && b.nextReview;

      if (aHasSchedule && !bHasSchedule) return -1;
      if (!aHasSchedule && bHasSchedule) return 1;

      if (aHasSchedule && bHasSchedule) {
        return parse(a.nextReview).getTime() - parse(b.nextReview).getTime();
      }

      return 0;
    });
}

function esc(s) {
  let e = document.createElement("div");
  e.textContent = s;
  return e.innerHTML;
}

function render() {
  let ds = due();

  let t = ds.find(x => x.id === currentId) || ds[0];
  currentId = t?.id || null;

  document.getElementById("current").innerHTML = t
    ? `<div class="current">
        <h3>${esc(t.title)}</h3>
        <div class="date">
          ${t.lastReviewed ? "Last done: " + esc(t.lastReviewed) : "Not done yet"}
        </div>
        ${t.historical ? '<span class="badge">Historical date imported</span>' : ""}
        <button class="done" id="done">DONE</button>
        <button class="shuffle" id="shuffle">SHUFFLE</button>
      </div>`
    : '<p class="muted">No task is currently due.</p>';

  if (t) {
    document.getElementById("done").onclick = () => open(t);

    document.getElementById("shuffle").onclick = () => {
      let otherDueTasks = ds.filter(task => task.id !== currentId);
      if (otherDueTasks.length === 0) return;
      let randomIndex = Math.floor(Math.random() * otherDueTasks.length);
      currentId = otherDueTasks[randomIndex].id;
      render();
    };
  }

  let sorted = [...tasks].sort((a, b) => {
    const aHasSchedule = a.stability != null && a.nextReview;
    const bHasSchedule = b.stability != null && b.nextReview;

    if (aHasSchedule && !bHasSchedule) return -1;
    if (!aHasSchedule && bHasSchedule) return 1;

    if (aHasSchedule && bHasSchedule) {
      return parse(a.nextReview).getTime() - parse(b.nextReview).getTime();
    }

    return 0;
  });

  document.getElementById("tasks").innerHTML = sorted.map(t => {
    let nextDate = t.nextReview ? parse(t.nextReview) : null;

    return `<div class="item">
      <div>
        <b>${esc(t.title)}</b>
        <div class="date">
          ${
            nextDate
              ? "Next: " + nextDate.toLocaleString("en-GB")
              : (t.lastReviewed ? "Last done: " + t.lastReviewed : "Not done")
          }
        </div>
        ${t.stability != null ? `<span class="badge">Stability: ${t.stability} days</span>` : ""}
      </div>
      <div class="task-actions">
        <select class="task-menu" data-id="${t.id}">
          <option value="">Options</option>
          <option value="complete">Complete task</option>
          <option value="delete">Delete task</option>
        </select>
      </div>
    </div>`;
  }).join("");

  document.querySelectorAll(".task-menu").forEach(menu => {
    menu.onchange = () => {
      const task = tasks.find(t => t.id === menu.dataset.id);
      if (!task) return;

      if (menu.value === "complete") {
        currentId = task.id;
        open(task);
      }

      if (menu.value === "delete") {
        if (confirm("Delete this task?")) {
          tasks = tasks.filter(t => t.id !== task.id);
          if (currentId === task.id) {
            currentId = null;
          }
          save();
          render();
        }
      }

      menu.value = "";
    };
  });

  const search = document.getElementById("search");
  search.oninput = () => {
    const query = search.value.toLowerCase().trim();
    document.querySelectorAll(".item").forEach(item => {
      const title = item.querySelector("b").textContent.toLowerCase();
      item.style.display = title.includes(query) ? "" : "none";
    });
  };
}

function open(t) {
  currentId = t.id;
  document.getElementById("modalTask").textContent = t.title;
  document.getElementById("modal").classList.remove("hidden");
}

document.getElementById("form").onsubmit = e => {
  e.preventDefault();
  let v = document.getElementById("title").value.trim();
  if (!v) return;
  tasks.push({
    id: crypto.randomUUID(),
    title: v,
    difficulty: null,
    stability: null,
    retrievability: null,
    lastReviewed: null,
    nextReview: null,
    historical: false
  });
  save();
  document.getElementById("title").value = "";
  render();
};

document.querySelectorAll("[data-r]").forEach(b => b.onclick = () => {
  let i = tasks.findIndex(t => t.id === currentId);
  if (i >= 0) {
    tasks[i] = process(tasks[i], Number(b.dataset.r));
    save();
  }
  document.getElementById("modal").classList.add("hidden");
  currentId = null;
  render();
});

document.getElementById("close").onclick = () => document.getElementById("modal").classList.add("hidden");

// Export functionality
document.getElementById("exportBtn").onclick = () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
  const downloadAnchor = document.createElement("a");
  
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `tasks_backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
};

// Import functionality
const importInput = document.getElementById("importInput");

document.getElementById("importBtn").onclick = () => {
  importInput.click();
};

importInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  
  reader.onload = (event) => {
    try {
      const importedTasks = JSON.parse(event.target.result);

      if (!Array.isArray(importedTasks)) {
        throw new Error("Invalid format: File must contain an array of tasks.");
      }

      if (confirm(`Import ${importedTasks.length} tasks? This will overwrite current tasks.`)) {
        tasks = importedTasks.map(t => ({
          ...t,
          id: t.id || crypto.randomUUID(),
          nextReview: t.nextReview && !isNaN(new Date(t.nextReview).getTime()) 
            ? new Date(t.nextReview).toISOString() 
            : null
        }));

        save();
        render();
        alert("Tasks imported successfully!");
      }
    } catch (err) {
      alert("Failed to import tasks: " + err.message);
    }
  };

  reader.readAsText(file);
  e.target.value = "";
};

render();
setInterval(render, 30000);
