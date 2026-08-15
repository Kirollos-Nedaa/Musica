const IPC = {
  BOT_READY: 'bot:ready',
  BOT_STATE: 'bot:state',
  BOT_LOG: 'bot:log',
  CONTROL: 'control',
  SHUTDOWN: 'control:shutdown',
};

function send(channel, message) {
  if (!channel || typeof channel.send !== 'function') return false;
  try {
    channel.send(message);
    return true;
  } catch {
    return false;
  }
}

module.exports = { IPC, send };
