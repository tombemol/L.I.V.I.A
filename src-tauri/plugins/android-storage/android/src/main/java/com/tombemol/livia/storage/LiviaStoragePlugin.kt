package com.tombemol.livia.storage

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class LiviaStoragePlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun isAllFilesAccessGranted(invoke: Invoke) {
        val response = JSObject()
        val granted =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()
        response.put("granted", granted)
        invoke.resolve(response)
    }

    @Command
    fun requestAllFilesAccess(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            invoke.resolve()
            return
        }

        try {
            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (_: Exception) {
            try {
                activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                invoke.resolve()
            } catch (error: Exception) {
                invoke.reject(
                    error.message
                        ?: "Não foi possível abrir a permissão de acesso a todos os arquivos."
                )
            }
        }
    }

    @Suppress("DEPRECATION")
    @Command
    fun sharedStorageRoot(invoke: Invoke) {
        val response = JSObject()
        response.put("path", Environment.getExternalStorageDirectory().absolutePath)
        invoke.resolve(response)
    }
}
