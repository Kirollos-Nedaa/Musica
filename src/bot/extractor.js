const { ExtractorPlugin, Song, Playlist, DisTubeError } = require('distube');
const { json } = require('@distube/yt-dlp');

const RESOLVE_FLAGS = {
  dumpSingleJson: true,
  noWarnings: true,
  preferFreeFormats: true,
  skipDownload: true,
  simulate: true,
};

const SEARCH_FLAGS = {
  dumpSingleJson: true,
  noWarnings: true,
  flatPlaylist: true,
  skipDownload: true,
  simulate: true,
};

const toSong = (info, plugin, options) =>
  new Song(
    {
      plugin,
      source: info.extractor || 'youtube',
      playFromSource: true,
      id: info.id,
      name: info.title || info.fulltitle,
      url: info.webpage_url || info.original_url || info.url,
      isLive: info.is_live,
      thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
      duration: info.is_live ? 0 : info.duration,
      uploader: {
        name: info.uploader,
        url: info.uploader_url,
      },
      views: info.view_count,
      likes: info.like_count,
      ageRestricted: Boolean(info.age_limit) && info.age_limit >= 18,
    },
    options
  );

const asYTDLPError = (err) => {
  if (err instanceof DisTubeError) return err;
  return new DisTubeError('YTDLP_ERROR', String(err?.stderr || err?.message || err));
};

/**
 * A DisTube extractor plugin backed by the bundled yt-dlp binary.
 * Handles URL resolution (900+ sites), YouTube search queries and stream URLs,
 * so the bot has both an `extractor` (search) and a `playable-extractor` in one.
 */
class SearchExtractor extends ExtractorPlugin {
  validate() {
    return true;
  }

  async resolve(url, options) {
    const info = await json(url, RESOLVE_FLAGS).catch(asYTDLPError);
    if (Array.isArray(info.entries)) {
      if (info.entries.length === 0) {
        throw new DisTubeError('YTDLP_ERROR', 'The playlist is empty');
      }
      return new Playlist(
        {
          source: info.extractor || 'youtube',
          songs: info.entries.map((i) => toSong(i, this, options)),
          id: String(info.id ?? url),
          name: info.title,
          url: info.webpage_url,
          thumbnail: info.thumbnails?.[0]?.url,
        },
        options
      );
    }
    return toSong(info, this, options);
  }

  async searchSong(query, options) {
    const info = await json(`ytsearch1:${query}`, RESOLVE_FLAGS).catch(asYTDLPError);
    const first = Array.isArray(info.entries) ? info.entries[0] : info;
    if (!first) throw new DisTubeError('NO_RESULT', query);
    return toSong(first, this, options);
  }

  async searchMulti(query, limit) {
    const count = Math.max(1, Math.min(Number(limit) || 5, 10));
    const info = await json(`ytsearch${count}:${query}`, SEARCH_FLAGS).catch(asYTDLPError);
    const entries = Array.isArray(info.entries) ? info.entries : [];
    return entries.map((entry) => toSong(entry, this, {}));
  }

  async getStreamURL(song) {
    if (!song.url) {
      throw new DisTubeError('YTDLP_PLUGIN_INVALID_SONG', 'Cannot get stream url from invalid song.');
    }
    const info = await json(song.url, { ...RESOLVE_FLAGS, format: 'ba/ba*' }).catch(asYTDLPError);
    if (Array.isArray(info.entries)) {
      throw new DisTubeError('YTDLP_ERROR', 'Cannot get stream URL of a entire playlist');
    }
    return info.url;
  }
}

module.exports = { SearchExtractor };
