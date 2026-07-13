// Cloudflare Worker Main Entry Script

// Helper to hash password using Web Crypto API
async function hashPassword(password) {
  if (!password) return null;
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Helper to return JSON Response with CORS headers
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    }
  });
}

// Export default worker handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
        }
      });
    }

    // 1. Route /board/:id to serve the static board.html
    if (path.startsWith('/board/')) {
      if (!env.ASSETS) {
        return new Response("Wrangler Assets binding not found.", { status: 500 });
      }
      const assetUrl = new URL('/board', request.url);
      return env.ASSETS.fetch(assetUrl);
    }

    // 2. Handle API endpoints
    if (path.startsWith('/api/')) {
      // Ensure Cloudflare KV Namespace is bound
      if (!env.COCAL_KV) {
        return jsonResponse({
          error: "Cloudflare KV Namespace 'COCAL_KV' is not bound. Please bind it in your Worker settings."
        }, 500);
      }

      // Parse path segments (e.g. /api/boards/123 -> ['api', 'boards', '123'])
      const segments = path.split('/').filter(Boolean);

      try {
        // A. POST /api/boards - Create a board
        if (segments.length === 2 && segments[1] === 'boards' && request.method === 'POST') {
          const { name, password } = await request.json();

          if (!name || name.trim() === '') {
            return jsonResponse({ error: 'Name is required' }, 400);
          }

          const id = crypto.randomUUID();
          const boardData = {
            id,
            name: name.trim(),
            passwordHash: await hashPassword(password),
            createdAt: new Date().toISOString(),
            responses: {}
          };

          await env.COCAL_KV.put(id, JSON.stringify(boardData));
          return jsonResponse({ id }, 201);
        }

        // B. GET /api/boards/:id - Get board details
        if (segments.length === 3 && segments[1] === 'boards' && request.method === 'GET') {
          const id = segments[2];
          const clientPassword = request.headers.get('x-board-password') || url.searchParams.get('password');

          const boardStr = await env.COCAL_KV.get(id);
          if (!boardStr) {
            return jsonResponse({ error: 'Board not found' }, 404);
          }

          const board = JSON.parse(boardStr);
          const hasPassword = !!board.passwordHash;
          
          // Verify password
          const clientHash = await hashPassword(clientPassword);
          const authenticated = !hasPassword || (board.passwordHash === clientHash);

          if (hasPassword && !authenticated) {
            return jsonResponse({ 
              error: 'Authentication required', 
              passwordRequired: true 
            }, 401);
          }

          // Return details without password hash
          const { passwordHash, ...safeBoardData } = board;
          return jsonResponse({
            ...safeBoardData,
            passwordRequired: hasPassword
          });
        }

        // C. POST /api/boards/:id/verify - Verify board password
        if (segments.length === 4 && segments[1] === 'boards' && segments[3] === 'verify' && request.method === 'POST') {
          const id = segments[2];
          const { password } = await request.json();

          const boardStr = await env.COCAL_KV.get(id);
          if (!boardStr) {
            return jsonResponse({ error: 'Board not found' }, 404);
          }

          const board = JSON.parse(boardStr);
          const clientHash = await hashPassword(password);
          const authenticated = !board.passwordHash || (board.passwordHash === clientHash);

          if (authenticated) {
            return jsonResponse({ success: true });
          } else {
            return jsonResponse({ success: false, error: 'Incorrect password' }, 401);
          }
        }

        // D. POST /api/boards/:id/respond - Add/update availability
        if (segments.length === 4 && segments[1] === 'boards' && segments[3] === 'respond' && request.method === 'POST') {
          const id = segments[2];
          const { friendName, availability, password } = await request.json();

          if (!friendName || friendName.trim() === '') {
            return jsonResponse({ error: 'Name is required' }, 400);
          }

          const boardStr = await env.COCAL_KV.get(id);
          if (!boardStr) {
            return jsonResponse({ error: 'Board not found' }, 404);
          }

          const board = JSON.parse(boardStr);
          const clientHash = await hashPassword(password);
          const authenticated = !board.passwordHash || (board.passwordHash === clientHash);

          if (!authenticated) {
            return jsonResponse({ error: 'Unauthorized: Incorrect password' }, 401);
          }

          // Update responses
          board.responses[friendName.trim()] = availability;
          await env.COCAL_KV.put(id, JSON.stringify(board));

          return jsonResponse({ success: true });
        }

        // E. DELETE /api/boards/:id/respond - Delete response
        if (segments.length === 4 && segments[1] === 'boards' && segments[3] === 'respond' && request.method === 'DELETE') {
          const id = segments[2];
          const { friendName, password } = await request.json();

          const boardStr = await env.COCAL_KV.get(id);
          if (!boardStr) {
            return jsonResponse({ error: 'Board not found' }, 404);
          }

          const board = JSON.parse(boardStr);
          const clientHash = await hashPassword(password);
          const authenticated = !board.passwordHash || (board.passwordHash === clientHash);

          if (!authenticated) {
            return jsonResponse({ error: 'Unauthorized: Incorrect password' }, 401);
          }

          if (board.responses[friendName]) {
            delete board.responses[friendName];
            await env.COCAL_KV.put(id, JSON.stringify(board));
            return jsonResponse({ success: true });
          } else {
            return jsonResponse({ error: 'Respondent not found' }, 404);
          }
        }

        return jsonResponse({ error: 'Endpoint not found' }, 404);

      } catch (error) {
        console.error('API Error:', error);
        return jsonResponse({ error: 'Serverless execution error: ' + error.message }, 500);
      }
    }

    // 3. Fallback for other requests (letting Wrangler Assets handle them)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  }
};
