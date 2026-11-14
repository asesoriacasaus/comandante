// Web Speech API. Sin temporizador propio: el auto-stop lo decide el navegador.

export function createRecognizer({ lang = 'es-ES', onPartial, onFinal, onError }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onError('unsupported');
    return null;
  }
  const r = new SR();
  r.lang = lang;
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;

  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + ' ';
      else interim += t;
    }
    onPartial(finalText + interim);
  };
  r.onerror = (e) => onError(e.error);
  r.onend = () => onFinal(finalText.trim());
  return r;
}
