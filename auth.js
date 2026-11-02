(function () {
  const form = document.getElementById('auth-form');
  const title = document.getElementById('auth-title');
  const submit = document.getElementById('auth-submit');
  const toggle = document.getElementById('auth-toggle');
  const prompt = document.getElementById('auth-prompt');
  const error = document.getElementById('auth-error');
  let mode = 'login';
  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    title.textContent = mode === 'login' ? 'Log in' : 'Create account';
    submit.textContent = mode === 'login' ? 'Log in' : 'Sign up';
    prompt.textContent = mode === 'login' ? 'New here?' : 'Already have an account?';
    toggle.textContent = mode === 'login' ? 'Create an account' : 'Log in';
    error.textContent = '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); error.textContent = '';
    try {
      await api('/api/' + mode, { method: 'POST', body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
      window.location.href = '/confessions.html';
    } catch (err) { error.textContent = err.message; }
  });
})();
