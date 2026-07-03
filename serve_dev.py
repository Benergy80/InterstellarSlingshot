# VOLKARIS dev server — no-store headers so the browser NEVER serves
# stale game modules (the cause of several ghost-bug reports)
import http.server, functools
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()
http.server.test(HandlerClass=functools.partial(NoCache, directory='/private/tmp/volkaris-worktree'), port=8700)
