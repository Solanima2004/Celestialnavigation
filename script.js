// id="changeButton" の要素（ボタン）を取得
const button = document.getElementById('changeButton');
// id="message" の要素（見出し）を取得
const message = document.getElementById('message');

// ボタンがクリックされたときの処理を定義
button.addEventListener('click', () => {
  message.textContent = 'ボタンが押されました！🚀';
  message.style.color = 'red';
});