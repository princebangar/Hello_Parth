import { ApiError } from '../../../../utils/ApiError.js';
import { User } from '../../user/models/User.js';
import { verifyAccessToken } from '../../services/tokenService.js';

export const getIdentityFromSocket = (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    throw new ApiError(401, 'Socket token is required');
  }

  const payload = verifyAccessToken(token);
  const role = String(payload.role || '').toLowerCase();
  const sub = payload.sub || payload.userId || payload.id || null;

  return {
    ...payload,
    role,
    sub,
  };
};

export const attachSocketAuth = (io) => {
  io.use(async (socket, next) => {
    try {
      socket.auth = getIdentityFromSocket(socket);

      if (socket.auth.role === 'user') {
        if (!socket.auth.sub) {
          throw new ApiError(401, 'Authorization token is invalid');
        }

        const user = await User.findById(socket.auth.sub).select('active isActive deletedAt').lean();

        if (!user || user.deletedAt || user.isActive === false || user.active === false) {
          throw new ApiError(401, 'User account is not active');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  });
};
