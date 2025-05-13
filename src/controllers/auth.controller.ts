import { Request, Response } from 'express';
import User from '../model/user.model';
import tokenService from '../services/token.service';
import { UnauthorizedError } from '../utils/customErrors';
import asyncHandler from '../utils/asyncHandler';
import logger from '../utils/logger';

interface IAuthResponse {
  success: boolean;
  accessToken?: string;
  message?: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

// Add a custom Request interface with user property
interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email?: string;
    role: string;
  };
}

class AuthController {
  adminLogin = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { email, password } = req.body;
      logger.info(`Admin login attempt for email: ${email}`);

      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        logger.warn(`No admin account found for email: ${email}`);
        throw new UnauthorizedError('No account found with this email address');
      }

      if (user.role !== 'admin') {
        logger.warn(`Non-admin user attempted admin login: ${email}`);
        throw new UnauthorizedError('Access denied: Admin privileges required');
      }

      const isPasswordCorrect = await user.comparePassword(password);
      if (!isPasswordCorrect) {
        logger.warn(`Incorrect password attempt for admin: ${email}`);
        throw new UnauthorizedError('Incorrect password');
      }

      const tokens = tokenService.generateTokens({
        userId: String(user._id),
        email: user.email,
        role: user.role,
      });

      user.refreshToken = tokens.refreshToken;
      await user.save();

      tokenService.setRefreshTokenCookie(res, tokens.refreshToken);
      logger.info(`Admin login successful for: ${email}`);

      const response: IAuthResponse = {
        success: true,
        accessToken: tokens.accessToken,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };

      res.json(response);
    }
  );

  refreshToken = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        throw new UnauthorizedError('Refresh token is required');
      }

      const decoded = await tokenService.verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.userId);

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Include all required properties in the token payload
      const tokens = await tokenService.rotateRefreshToken(refreshToken, {
        userId: user._id.toString(),
        email: user.email, // Add the required email property
        role: decoded.role || 'researcher',
      });

      user.refreshToken = tokens.refreshToken;
      await user.save();

      tokenService.setRefreshTokenCookie(res, tokens.refreshToken);

      const response: IAuthResponse = {
        success: true,
        accessToken: tokens.accessToken,
      };

      res.status(200).json(response);
    }
  );

  logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      try {
        const decoded = await tokenService.verifyRefreshToken(refreshToken);
        await tokenService.blacklistToken(
          refreshToken,
          new Date(decoded.exp! * 1000) // Non-null assertion, as we know it exists after verifyRefreshToken
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Invalid token during logout:', errorMessage);
      }
    }

    tokenService.clearRefreshTokenCookie(res);

    const response: IAuthResponse = {
      success: true,
      message: 'Logged out successfully',
    };

    res.status(200).json(response);
  });

  // Use the custom request interface
  verifyToken = asyncHandler(
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const response: IAuthResponse = {
        success: true,
        user: {
          id: req.user.userId,
          role: req.user.role,
        },
      };

      res.status(200).json(response);
    }
  );
}

export default new AuthController();
