/**
 * Turns "which window is in front" into what the duck should be doing.
 * Pure function, no Electron or OS calls, so it can be unit tested.
 *
 * Input:  { proc, title, spotifyTitle }
 *   proc          process / app name of the foreground window (e.g. "Code", "chrome", "Spotify")
 *   title         foreground window title ("" when the OS doesn't provide it)
 *   spotifyTitle  title of the Spotify desktop window, wherever it is ("" if Spotify isn't running)
 * Output: { scene, music } or null when the foreground window is ErgoGotchi itself
 *   scene  'WATCHING' | 'WORKING' | 'IDLE'
 *   music  true while music is playing or a music app is in front
 */

const WATCH_TITLES = /\b(youtube|netflix|twitch|hulu|disney\+|prime video|crunchyroll)/i;
const WATCH_PROCS = /^(vlc|mpv|mpc-hc|mpc-hc64|netflix|iina|quicktime player|tv)$/i;

const MUSIC_TITLES = /\b(youtube music|spotify|soundcloud|apple music|pandora|deezer|bandcamp)\b/i;
const MUSIC_PROCS = /^(spotify|music|itunes|applemusic|tidal|deezer|foobar2000|winamp|musicbee)$/i;

const WORK_PROCS = new RegExp(
  '^(' +
    [
      // editors and IDEs
      'code', 'code - insiders', 'cursor', 'windsurf', 'zed', 'devenv', 'sublime_text', 'notepad\\+\\+', 'notepad',
      'idea64', 'pycharm64', 'webstorm64', 'clion64', 'rider64', 'goland64', 'phpstorm64', 'rubymine64', 'datagrip64',
      'studio64', 'android studio', 'xcode', 'eclipse', 'atom', 'vim', 'nvim', 'emacs',
      'visual studio code', 'intellij idea', 'pycharm', 'webstorm',
      // terminals
      'windowsterminal', 'wt', 'cmd', 'powershell', 'pwsh', 'conhost', 'terminal', 'iterm2', 'warp', 'alacritty',
      'wezterm-gui', 'kitty', 'mintty', 'git-bash',
      // office and design
      'winword', 'excel', 'powerpnt', 'onenote', 'outlook', 'microsoft word', 'microsoft excel',
      'microsoft powerpoint', 'pages', 'numbers', 'keynote', 'notion', 'obsidian', 'figma', 'acrobat', 'acrord32',
      'postman', 'docker desktop', 'github desktop', 'githubdesktop', 'slack', 'teams', 'ms-teams', 'zoom',
    ].join('|') +
    ')$',
  'i'
);
const WORK_TITLES =
  /\b(github|gitlab|bitbucket|stack overflow|google docs|google sheets|google slides|localhost|127\.0\.0\.1|jira|confluence|notion|overleaf|colab|jupyter|leetcode|figma|canvas|gmail|outlook|vercel|aws|azure|docs\.)/i;

/** The Spotify desktop window shows "Artist - Song" while playing and just its own name otherwise. */
function spotifyIsPlaying(spotifyTitle) {
  const t = (spotifyTitle || '').trim();
  if (!t) return false;
  return !/^spotify( free| premium)?$/i.test(t);
}

function classifyActivity({ proc = '', title = '', spotifyTitle = '' } = {}) {
  const p = String(proc).trim().replace(/\.exe$/i, '');
  const t = String(title);

  // Our own windows (the pet, its menu, the dashboard) say nothing about what the user is doing
  const isOwnWindow = /^ergogotchi$/i.test(p) || (/^(electron|node)$/i.test(p) && /ergogotchi/i.test(t));
  if (isOwnWindow) return null;

  const musicInFront = MUSIC_PROCS.test(p) || MUSIC_TITLES.test(t);
  const music = musicInFront || spotifyIsPlaying(spotifyTitle);

  let scene = 'IDLE';
  if (musicInFront) scene = 'IDLE'; // "YouTube Music" must not count as watching YouTube
  else if (WATCH_PROCS.test(p) || WATCH_TITLES.test(t)) scene = 'WATCHING';
  else if (WORK_PROCS.test(p) || WORK_TITLES.test(t)) scene = 'WORKING';

  return { scene, music };
}

module.exports = { classifyActivity, spotifyIsPlaying };
