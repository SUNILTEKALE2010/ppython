const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send(
      "<h1>Setup Error</h1><p>public/index.html not found.</p>" +
      "<pre>package.json\nserver.js\npublic/\n  index.html</pre>"
    );
  }
});

// ── Topic rooms ──────────────────────────────────────────────
const TOPICS = [
  "If-Else in Python",
  "Loops in Python",
  "Functions in Python",
  "Sets in Python",
  "Python Basics",
  "Tuples and Lists in Python",
];

const MAX_PER_ROOM = 10;

// rooms[topicIndex] = { students: [{id, name, score, correct, total, finished}], started, endedAt }
const rooms = {};
TOPICS.forEach((_, i) => {
  rooms[i] = { students: [], started: false, endedAt: null };
});

// socketId → { topicIndex, name }
const socketMap = {};

function roomInfo() {
  return TOPICS.map((name, i) => ({
    name,
    index: i,
    count: rooms[i].students.length,
    max: MAX_PER_ROOM,
    full: rooms[i].students.length >= MAX_PER_ROOM,
    started: rooms[i].started,
  }));
}

function broadcastRoomInfo() {
  io.emit("room-info", roomInfo());
}

function broadcastRoomStudents(topicIndex) {
  const room = rooms[topicIndex];
  const list = room.students.map((s) => ({
    name: s.name,
    finished: s.finished,
    score: s.finished ? s.score : null,
    correct: s.finished ? s.correct : null,
    total: s.total,
  }));
  io.to("topic-" + topicIndex).emit("room-students", {
    topic: TOPICS[topicIndex],
    topicIndex,
    students: list,
    allFinished: room.students.length > 0 && room.students.every((s) => s.finished),
  });
}

// ── Questions per topic ──────────────────────────────────────
const QUESTIONS = {
  0: [ // If-Else
    { q: "What will this code print?\n\nx = 10\nif x > 15:\n    print('A')\nelif x > 5:\n    print('B')\nelse:\n    print('C')", o: ["A", "B", "C", "Error"], a: 1 },
    { q: "Which operator checks equality in Python?", o: ["=", "==", "!=", "==="], a: 1 },
    { q: "What is the output?\n\nx = 0\nif x:\n    print('Yes')\nelse:\n    print('No')", o: ["Yes", "No", "0", "Error"], a: 1 },
    { q: "Which keyword is used for multiple conditions after 'if'?", o: ["else if", "elif", "elseif", "elsif"], a: 1 },
    { q: "What will this print?\n\na, b = 5, 5\nif a > b:\n    print('Greater')\nelif a == b:\n    print('Equal')\nelse:\n    print('Less')", o: ["Greater", "Equal", "Less", "Error"], a: 1 },
    { q: "What is the output?\n\nx = 'hello'\nif x:\n    print('Truthy')\nelse:\n    print('Falsy')", o: ["Truthy", "Falsy", "hello", "Error"], a: 0 },
    { q: "Which of these is a valid if statement?", o: ["if(x > 5):", "if x > 5:", "if x > 5 then:", "if x > 5 do:"], a: 1 },
    { q: "What is the output?\n\nage = 20\nresult = 'Adult' if age >= 18 else 'Minor'\nprint(result)", o: ["Adult", "Minor", "Error", "None"], a: 0 },
    { q: "What happens if all if/elif conditions are False and there's no else?", o: ["Error occurs", "None is printed", "Nothing happens", "Program exits"], a: 2 },
    { q: "What is the output?\n\nx = None\nif x is None:\n    print('Empty')\nelse:\n    print('Has value')", o: ["Empty", "Has value", "None", "Error"], a: 0 },
  ],
  1: [ // Loops
    { q: "How many times will this loop run?\n\nfor i in range(5):\n    print(i)", o: ["4", "5", "6", "Infinite"], a: 1 },
    { q: "What does 'break' do inside a loop?", o: ["Skips current iteration", "Exits the loop entirely", "Restarts the loop", "Pauses execution"], a: 1 },
    { q: "What is the output?\n\nfor i in range(1, 4):\n    print(i, end=' ')", o: ["1 2 3", "1 2 3 4", "0 1 2 3", "0 1 2"], a: 0 },
    { q: "What does 'continue' do in a loop?", o: ["Exits the loop", "Skips to next iteration", "Restarts from beginning", "Stops the program"], a: 1 },
    { q: "What is the output?\n\ni = 0\nwhile i < 3:\n    print(i)\n    i += 1", o: ["0 1 2", "0 1 2 3", "1 2 3", "Infinite loop"], a: 0 },
    { q: "What is range(2, 10, 3)?", o: ["[2, 5, 8]", "[2, 4, 6, 8]", "[2, 5, 8, 11]", "[3, 6, 9]"], a: 0 },
    { q: "What is the output?\n\nfor i in range(3):\n    if i == 1:\n        continue\n    print(i, end=' ')", o: ["0 2", "0 1 2", "1 2", "0"], a: 0 },
    { q: "Which loop is guaranteed to run at least once?", o: ["for loop", "while loop", "do-while loop", "None in Python"], a: 3 },
    { q: "What is the output?\n\nfor i in 'Python':\n    if i == 'h':\n        break\n    print(i, end='')", o: ["Pyt", "Pyth", "Python", "P"], a: 0 },
    { q: "What is the output?\n\nfor i in range(5):\n    pass\nprint(i)", o: ["4", "5", "0", "Error"], a: 0 },
  ],
  2: [ // Functions
    { q: "What keyword defines a function in Python?", o: ["function", "func", "def", "define"], a: 2 },
    { q: "What is the output?\n\ndef greet(name):\n    return 'Hello ' + name\n\nprint(greet('Alice'))", o: ["Hello Alice", "Hello name", "Error", "None"], a: 0 },
    { q: "What does a function return if there's no return statement?", o: ["0", "''", "None", "Error"], a: 2 },
    { q: "What is the output?\n\ndef add(a, b=10):\n    return a + b\n\nprint(add(5))", o: ["5", "10", "15", "Error"], a: 2 },
    { q: "What are *args used for?", o: ["Keyword arguments", "Variable positional arguments", "Default arguments", "Required arguments"], a: 1 },
    { q: "What is the output?\n\ndef square(n):\n    return n ** 2\n\nresult = square(4)\nprint(result)", o: ["8", "16", "4", "Error"], a: 1 },
    { q: "What is a lambda function?", o: ["A named function", "An anonymous one-line function", "A recursive function", "A built-in function"], a: 1 },
    { q: "What is the output?\n\ndef modify(lst):\n    lst.append(4)\n\nx = [1, 2, 3]\nmodify(x)\nprint(x)", o: ["[1, 2, 3]", "[1, 2, 3, 4]", "Error", "None"], a: 1 },
    { q: "What are **kwargs used for?", o: ["Positional arguments", "Variable keyword arguments", "Default values", "List arguments"], a: 1 },
    { q: "What is the output?\n\ndef outer():\n    x = 10\n    def inner():\n        return x\n    return inner()\n\nprint(outer())", o: ["10", "Error", "None", "x"], a: 0 },
  ],
  3: [ // Sets
    { q: "What is the output?\n\ns = {1, 2, 2, 3, 3, 3}\nprint(len(s))", o: ["6", "3", "1", "Error"], a: 1 },
    { q: "How do you create an empty set?", o: ["{}", "set()", "set([])", "new set()"], a: 1 },
    { q: "What is {1, 2, 3} & {2, 3, 4}?", o: ["{1, 2, 3, 4}", "{2, 3}", "{1, 4}", "Error"], a: 1 },
    { q: "What is {1, 2, 3} | {3, 4, 5}?", o: ["{1, 2, 3, 4, 5}", "{3}", "{1, 2, 4, 5}", "Error"], a: 0 },
    { q: "What is {1, 2, 3} - {2, 3, 4}?", o: ["{1}", "{4}", "{1, 4}", "Error"], a: 0 },
    { q: "Which method adds an element to a set?", o: ["append()", "add()", "insert()", "push()"], a: 1 },
    { q: "Are sets ordered in Python?", o: ["Yes, always", "No, unordered", "Only when sorted", "Depends on version"], a: 1 },
    { q: "What is {1, 2, 3} ^ {2, 3, 4}?", o: ["{2, 3}", "{1, 4}", "{1, 2, 3, 4}", "Error"], a: 1 },
    { q: "What does discard() do if the element doesn't exist?", o: ["Raises KeyError", "Does nothing", "Returns False", "Removes last element"], a: 1 },
    { q: "What is the output?\n\ns = {1, 2, 3}\ns.add(2)\nprint(len(s))", o: ["4", "3", "Error", "2"], a: 1 },
  ],
  4: [ // Python Basics
    { q: "What is the correct file extension for Python files?", o: [".python", ".pt", ".py", ".pyt"], a: 2 },
    { q: "How do you print 'Hello World' in Python?", o: ["echo 'Hello World'", "print('Hello World')", "console.log('Hello World')", "printf('Hello World')"], a: 1 },
    { q: "Which of these is a valid variable name?", o: ["2name", "my-name", "my_name", "class"], a: 2 },
    { q: "What is the output of type(42)?", o: ["<class 'int'>", "<class 'float'>", "<class 'str'>", "42"], a: 0 },
    { q: "How do you write a comment in Python?", o: ["// comment", "/* comment */", "# comment", "-- comment"], a: 2 },
    { q: "What is the output of 10 // 3?", o: ["3.33", "3", "4", "1"], a: 1 },
    { q: "What is the output of 2 ** 3?", o: ["6", "8", "5", "Error"], a: 1 },
    { q: "What data type is True?", o: ["int", "str", "bool", "float"], a: 2 },
    { q: "What is the output?\n\nx = '5'\ny = 3\nprint(x * y)", o: ["15", "555", "Error", "53"], a: 1 },
    { q: "Which function gets user input in Python?", o: ["scan()", "input()", "read()", "get()"], a: 1 },
  ],
  5: [ // Tuples and Lists
    { q: "Which of these creates a tuple?", o: ["[1, 2, 3]", "(1, 2, 3)", "{1, 2, 3}", "<1, 2, 3>"], a: 1 },
    { q: "Can you modify elements in a tuple?", o: ["Yes", "No, tuples are immutable", "Only with a method", "Only the last element"], a: 1 },
    { q: "What is the output?\n\nlst = [1, 2, 3, 4, 5]\nprint(lst[1:3])", o: ["[1, 2, 3]", "[2, 3]", "[2, 3, 4]", "[1, 2]"], a: 1 },
    { q: "Which method adds an item to the end of a list?", o: ["add()", "append()", "insert()", "push()"], a: 1 },
    { q: "What is the output?\n\nt = (1, 2, 3)\nprint(t[0])", o: ["1", "2", "(1)", "Error"], a: 0 },
    { q: "How do you create a tuple with one element?", o: ["(1)", "(1,)", "[1]", "tuple(1)"], a: 1 },
    { q: "What is the output?\n\nlst = [3, 1, 4, 1, 5]\nlst.sort()\nprint(lst)", o: ["[3, 1, 4, 1, 5]", "[1, 1, 3, 4, 5]", "[5, 4, 3, 1, 1]", "Error"], a: 1 },
    { q: "What is the difference between list and tuple?", o: ["Lists are faster", "Tuples are mutable", "Lists are mutable, tuples are not", "No difference"], a: 2 },
    { q: "What is the output?\n\nlst = [1, 2, 3]\nlst.insert(1, 'a')\nprint(lst)", o: ["[1, 'a', 2, 3]", "['a', 1, 2, 3]", "[1, 2, 'a', 3]", "Error"], a: 0 },
    { q: "What is the output?\n\nt = (1, 2, 3) + (4, 5)\nprint(len(t))", o: ["3", "5", "2", "Error"], a: 1 },
  ],
};

// ── Socket events ────────────────────────────────────────────
io.on("connection", (socket) => {
  // Send current room info on connect
  socket.emit("room-info", roomInfo());

  socket.on("login", ({ name, password }, cb) => {
    if (!name || !name.trim()) return cb({ ok: false, msg: "Name is required." });
    if (!password || password.trim().toLowerCase() !== name.trim().toLowerCase()) {
      return cb({ ok: false, msg: "Password must match your name." });
    }
    cb({ ok: true });
  });

  socket.on("join-topic", ({ topicIndex, name }, cb) => {
    if (topicIndex < 0 || topicIndex >= TOPICS.length) {
      return cb({ ok: false, msg: "Invalid topic." });
    }
    const room = rooms[topicIndex];
    if (room.students.length >= MAX_PER_ROOM) {
      return cb({ ok: false, msg: "This room is full (max " + MAX_PER_ROOM + " students)." });
    }
    // Check duplicate name in room
    if (room.students.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())) {
      return cb({ ok: false, msg: "A student with this name is already in this room." });
    }

    const student = {
      id: socket.id,
      name: name.trim(),
      score: 0,
      correct: 0,
      total: QUESTIONS[topicIndex].length,
      finished: false,
    };
    room.students.push(student);
    socketMap[socket.id] = { topicIndex, name: name.trim() };
    socket.join("topic-" + topicIndex);

    cb({ ok: true, topic: TOPICS[topicIndex], questions: QUESTIONS[topicIndex] });
    broadcastRoomInfo();
    broadcastRoomStudents(topicIndex);
  });

  socket.on("submit-answer", ({ topicIndex, questionIndex, answerIndex }) => {
    const room = rooms[topicIndex];
    if (!room) return;
    const student = room.students.find((s) => s.id === socket.id);
    if (!student || student.finished) return;

    const q = QUESTIONS[topicIndex][questionIndex];
    if (!q) return;

    const correct = answerIndex === q.a;
    if (correct) {
      student.correct++;
      student.score += 10; // 10 marks per correct answer
    }
  });

  socket.on("finish-test", ({ topicIndex }) => {
    const room = rooms[topicIndex];
    if (!room) return;
    const student = room.students.find((s) => s.id === socket.id);
    if (!student) return;
    student.finished = true;
    broadcastRoomStudents(topicIndex);

    // Send personal result
    socket.emit("your-result", {
      topic: TOPICS[topicIndex],
      name: student.name,
      score: student.score,
      correct: student.correct,
      total: student.total,
    });
  });

  socket.on("get-leaderboard", (cb) => {
    const data = TOPICS.map((topic, i) => ({
      topic,
      students: rooms[i].students
        .filter((s) => s.finished)
        .sort((a, b) => b.score - a.score)
        .map((s) => ({ name: s.name, score: s.score, correct: s.correct, total: s.total })),
      active: rooms[i].students.filter((s) => !s.finished).length,
      totalJoined: rooms[i].students.length,
    }));
    cb(data);
  });

  socket.on("disconnect", () => {
    const info = socketMap[socket.id];
    if (!info) return;
    const room = rooms[info.topicIndex];
    if (room) {
      room.students = room.students.filter((s) => s.id !== socket.id);
      broadcastRoomStudents(info.topicIndex);
      broadcastRoomInfo();
    }
    delete socketMap[socket.id];
  });
});

// ── Admin endpoint: view all results ─────────────────────────
app.get("/admin/results", (req, res) => {
  const results = TOPICS.map((topic, i) => ({
    topic,
    students: rooms[i].students.map((s) => ({
      name: s.name,
      score: s.score,
      correct: s.correct,
      total: s.total,
      finished: s.finished,
    })),
  }));
  res.json(results);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Assessment server running on port ${PORT}`));
