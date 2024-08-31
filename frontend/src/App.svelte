<script>
  import { onMount } from "svelte";

  let students = [];
  let name = "";
  let grade = "";
  let audioFile = "";
  let searchQuery = "";
  let editingStudent = null;
  let isPlaying = false;
  let token = localStorage.getItem("token");
  let role = localStorage.getItem("role");
  let username = "";
  let password = "";
  let selectedStudent = null;
  let currentPage = 1;
  let totalPages = 1;
  let totalStudents = 0;
  let limit = 10;
  let searchTimeout;

  const API_URL = "http://localhost:3000";

  onMount(async () => {
    if (token) {
      await fetchStudents();
      setInterval(checkAudioState, 1000);
    }
  });

  async function login() {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (response.ok) {
      token = data.token;
      role = data.role;
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      await fetchStudents();
    } else {
      alert(data.error);
    }
  }

  function logout() {
    token = null;
    role = null;
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    students = [];
  }

  function selectStudent(student) {
    if (selectedStudent && selectedStudent.id === student.id) {
      selectedStudent = null;
    } else {
      selectedStudent = student;
    }
  }

  async function fetchStudents() {
    const response = await fetch(
      `${API_URL}/students?page=${currentPage}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await response.json();
    students = data.students;
    currentPage = data.currentPage;
    totalPages = data.totalPages;
    totalStudents = data.totalStudents;
  }

  async function addStudent() {
    if (!name.trim() || !grade.trim()) {
      alert("Cannot add empty student. Name and grade must be nonempty");
      return;
    }

    const response = await fetch(`${API_URL}/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, grade, audio_file: audioFile }),
    });
    if (response.ok) {
      name = "";
      grade = "";
      audioFile = "";
      await fetchStudents();
    }
  }

  async function updateStudent() {
    const response = await fetch(`${API_URL}/students/${editingStudent.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, grade, audio_file: audioFile }),
    });
    if (response.ok) {
      editingStudent = null;
      name = "";
      grade = "";
      audioFile = "";
      await fetchStudents();
    }
  }

  async function deleteStudent(student) {
    if (confirm(`🚨🚨🚨 Are you sure you want to delete ${student.name}?!`)) {
      const response = await fetch(`${API_URL}/students/${student.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        await fetchStudents();
      }
    }
  }

  function debounce(func, wait) {
    return (...args) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const debouncedSearch = debounce(async () => {
    currentPage = 1;
    await searchStudents();
  }, 300); // Wait for 300ms of inactivity before searching

  async function searchStudents() {
    const response = await fetch(
      `${API_URL}/students/search?query=${searchQuery}&page=${currentPage}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await response.json();
    students = data.students;
    currentPage = data.currentPage;
    totalPages = data.totalPages;
    totalStudents = data.totalStudents;
  }

  async function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalPages) {
      currentPage = newPage;
      if (searchQuery) {
        await searchStudents();
      } else {
        await fetchStudents();
      }
    }
  }

  async function callStudent(id) {
    const response = await fetch(`${API_URL}/call/${id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (response.ok) {
      console.log(result.message);
    } else {
      alert(result.error);
    }
  }

  function editStudent(student) {
    editingStudent = student;
    name = student.name;
    grade = student.grade;
    audioFile = student.audio_file;
  }

  function cancelEditing() {
    editingStudent = null;
    name = "";
    grade = "";
    audioFile = "";
  }

  async function checkAudioState() {
    const response = await fetch(`${API_URL}/audio-state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const state = await response.json();
    isPlaying = state.isPlaying;
  }

  async function playAudio(filename) {
    try {
      const response = await fetch(`${API_URL}/play-audio/${filename}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        console.log(`${filename} played successfully!`);
      } else {
        const error = await response.json();
        alert(`Failed to play ${filename}: ${error.error}`);
      }
    } catch (error) {
      alert(`Failed to play ${filename} (network error): ${error.message}`);
    }
  }
</script>

<main>
  <h1>School Pick-up System</h1>

  {#if !token}
    <h2>Login</h2>
    <input bind:value={username} placeholder="Username" />
    <input bind:value={password} type="password" placeholder="Password" />
    <button on:click={login}>Login</button>
  {:else}
    <button on:click={logout}>Logout</button>

    {#if role === "admin"}
      <div>
        <h2>{editingStudent ? "Edit Student" : "Add Student"}</h2>
        <input bind:value={name} placeholder="Name" />
        <input bind:value={grade} placeholder="Grade" />
        <input bind:value={audioFile} placeholder="Audio File" />
        <button
          on:click={() => playAudio(audioFile)}
          disabled={!audioFile.trim()}>Play</button
        >
        <button
          on:click={editingStudent ? updateStudent : addStudent}
          disabled={!name.trim() || !grade.trim()}
        >
          {editingStudent ? "Update" : "Add"}
        </button>
        {#if editingStudent}
          <button on:click={cancelEditing}>Cancel</button>
        {/if}
        <button on:click={() => playAudio("test.mp3")}>Play Test Audio</button>
      </div>
    {/if}

    <div>
      <h2>Search Students</h2>
      <input
        bind:value={searchQuery}
        placeholder="Search by name"
        on:input={debouncedSearch}
      />
    </div>
    <div>
      <h2>Student List</h2>
      <table>
        <tr>
          <th>Name</th>
          <th>Grade</th>
        </tr>
        {#each students as student}
          <tr
            class:selected={selectedStudent &&
              selectedStudent.id === student.id}
            on:click={() => selectStudent(student)}
          >
            <td>{student.name}</td>
            <td>{student.grade}</td>
          </tr>
          {#if selectedStudent && selectedStudent.id === student.id}
            <tr class="actions-row">
              <td colspan="2">
                {#if role === "admin"}
                  <button on:click={() => editStudent(student)}>Edit</button>
                  <button on:click={() => deleteStudent(student)}>Delete</button
                  >
                {/if}
                <button
                  on:click={() => callStudent(student.id)}
                  disabled={isPlaying}
                >
                  {isPlaying ? "Audio Playing" : "Call"}
                </button>
              </td>
            </tr>
          {/if}
        {/each}
      </table>
      {#if !students.length}
        <p class="no-students-found">No students found :(</p>
      {/if}

      <div class="pagination">
        <button
          on:click={() => changePage(currentPage - 1)}
          disabled={currentPage === 1}>Previous</button
        >
        <span>Page {currentPage} of {totalPages}</span>
        <button
          on:click={() => changePage(currentPage + 1)}
          disabled={currentPage === totalPages}>Next</button
        >
      </div>
      <p>Total Students: {totalStudents}</p>
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  input,
  button {
    margin: 5px;
  }

  table {
    width: 100%;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  tr {
    cursor: pointer;
  }

  tr {
    padding: 10px; /* add padding to rows */
    margin-bottom: 5px; /* add margin between rows */
  }

  tr.selected {
    background-color: #e0e0e0;
  }

  tr:hover {
    background-color: #e0e0e0;
    cursor: pointer;
  }

  td {
    padding: 10px; /* add padding to cells */
  }

  .actions-row {
    background-color: #f0f0f0;
  }

  .actions-row td {
    padding: 10px;
    text-align: center;
  }

  button {
    margin: 0 5px;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: 20px;
  }

  .pagination button {
    margin: 0 10px;
  }

  .pagination span {
    margin: 0 10px;
  }

  .no-students-found {
    text-align: center;
    margin: 20px 0;
    padding: 20px;
    font-size: 18px;
    font-weight: bold;
  }
</style>
