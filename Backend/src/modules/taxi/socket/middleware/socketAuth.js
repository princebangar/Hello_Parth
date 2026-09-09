import { ApiError } from '../../../../utils/ApiError.js';
import { User } from '../../user/models/User.js';
import { verifyAccessToken } from '../../services/tokenService.js';

export const getIdentityFromSocket = (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    throw new ApiError(401, 'Socket token is required');
  }

  const payload = verifyAccessToken(token);
  const subjectId = String(payload.sub || payload.userId || payload.id || '').trim();
  const role = String(payload.role || '').trim().toLowerCase();

  return {
    ...payload,
    sub: subjectId,
    role: role === 'super-admin' ? 'admin' : role,
    originalRole: payload.role,
  };
};

export const attachSocketAuth = (io) => {
  io.use(async (socket, next) => {
    try {
      socket.auth = getIdentityFromSocket(socket);

      if (socket.auth.role === 'user') {
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
