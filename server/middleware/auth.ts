import {getRepository} from '@server/datasource';
import {User} from '@server/entity/User';
import type {
  Permission,
  PermissionCheckOptions,
} from '@server/lib/permissions';
import {getSettings} from '@server/lib/settings';
import JellyfinAPI from "@server/api/jellyfin";
import {getHostname} from "@server/utils/getHostname";

export const checkUser: Middleware = async (req, _res, next) => {
  const settings = getSettings();
  let user: User | undefined | null;

  if (req.header('X-API-Key') === settings.main.apiKey) {
    const userRepository = getRepository(User);

    let userId = 1; // Work on original administrator account

    // If a User ID is provided, we will act on that user's behalf
    if (req.header('X-API-User')) {
      userId = Number(req.header('X-API-User'));
    }

    user = await userRepository.findOne({where: {id: userId}});
  } else if (req.session?.userId) {
    const userRepository = getRepository(User);

    user = await userRepository.findOne({
      where: {id: req.session.userId},
    });
  } else if (req.header('X-Emby-Token')) {
    const token = req.header('X-Emby-Token');

    const hostname =
      settings.jellyfin.ip !== ''
        ? getHostname() : '';

    const jellyfinserver = new JellyfinAPI(hostname ?? '', token, "");
    const account = await jellyfinserver.getUsers()
    const foundUser = await userRepository.findOne({
      where: { jellyfinUserId: account.User.Id },
    });

    if (account.User.Id === user?.jellyfinUserId) {
        user = foundUser;
    } else {
      user = new User({
        email: account.User.email ? account.User.email : account.User.name + "@fakeemail.com",
        jellyfinUsername: account.User.Name,
        jellyfinUserId: account.User.Id,
        jellyfinDeviceId: "",
        permissions: settings.main.defaultPermissions,
        userType: UserType.JELLYFIN
      });

      user.setPassword('')
      await userRepository.save(user);
    }
  }


  if (user) {
    req.user = user;
  }

  req.locale = user?.settings?.locale
    ? user.settings.locale
    : settings.main.locale;

  next();
};

export const isAuthenticated = (
  permissions?: Permission | Permission[],
  options?: PermissionCheckOptions
): Middleware => {
  const authMiddleware: Middleware = (req, res, next) => {
    if (!req.user || !req.user.hasPermission(permissions ?? 0, options)) {
      res.status(403).json({
        status: 403,
        error: 'You do not have permission to access this endpoint',
      });
    } else {
      next();
    }
  };
  return authMiddleware;
};
