use serde::Deserialize;
use tauri::{
    plugin::{Builder, PluginApi, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime, State,
};

mod error;
pub use error::{Error, Result};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccessResponse {
    granted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathResponse {
    path: String,
}

pub trait AndroidStorageExt<R: Runtime> {
    fn android_storage(&self) -> State<'_, AndroidStorage<R>>;
}

impl<R: Runtime, T: Manager<R>> AndroidStorageExt<R> for T {
    fn android_storage(&self) -> State<'_, AndroidStorage<R>> {
        self.state::<AndroidStorage<R>>()
    }
}

pub struct AndroidStorage<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AndroidStorage<R> {
    pub fn has_all_files_access(&self) -> Result<bool> {
        let response: AccessResponse =
            self.0.run_mobile_plugin("isAllFilesAccessGranted", ())?;
        Ok(response.granted)
    }

    pub fn request_all_files_access(&self) -> Result<()> {
        self.0.run_mobile_plugin::<()>("requestAllFilesAccess", ())?;
        Ok(())
    }

    pub fn shared_storage_root(&self) -> Result<String> {
        let response: PathResponse =
            self.0.run_mobile_plugin("sharedStorageRoot", ())?;
        Ok(response.path)
    }
}

fn init_android<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<AndroidStorage<R>> {
    let handle =
        api.register_android_plugin("com.tombemol.livia.storage", "LiviaStoragePlugin")?;
    Ok(AndroidStorage(handle))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("livia-android-storage")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let storage = init_android(app, api)?;
                app.manage(storage);
            }
            Ok(())
        })
        .build()
}
