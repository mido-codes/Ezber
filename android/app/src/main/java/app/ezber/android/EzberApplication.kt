package app.ezber.android

import android.app.Application

/** Owns the single [AppEnvironment] for the process. */
class EzberApplication : Application() {

    val environment: AppEnvironment by lazy { AppEnvironment.live(this) }

    override fun onCreate() {
        super.onCreate()
        environment.bootstrap()
    }
}
