type CloudSettingsSource = {
    baseUrl: string;
    token: string;
};

type PublicSettingsLoaders<T> = {
    loadLocal: () => Promise<T>;
    loadCloud: (baseUrl: string, token: string) => Promise<T>;
    syncDesktop: () => Promise<T>;
};

export function loadPublicSettingsForSession<T>(cloud: CloudSettingsSource | null, isDesktopApp: boolean, loaders: PublicSettingsLoaders<T>) {
    if (!cloud) return loaders.loadLocal();
    if (isDesktopApp) return loaders.syncDesktop();
    return loaders.loadCloud(cloud.baseUrl, cloud.token);
}
