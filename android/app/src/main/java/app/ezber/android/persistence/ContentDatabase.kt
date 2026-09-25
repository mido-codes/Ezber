package app.ezber.android.persistence

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Opens `ezber-content.sqlite` in the app's private database directory, the
 * lazily filled cache of the web content bundle (see
 * `content/ContentRepository`). The canonical DDL lives in
 * `schema/content_schema.sql`; [ContentSchema] holds the Android copy.
 *
 * This file is deliberately separate from `ezber-user.sqlite`: content updates
 * can clear and refill it without touching presets, progress or notes.
 */
class ContentDatabase(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    DATABASE_NAME,
    null,
    ContentSchema.VERSION,
) {

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        ContentSchema.create(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        ContentSchema.migrate(db, oldVersion, newVersion)
    }

    companion object {
        /** File name promised by schema/README.md for the content cache. */
        const val DATABASE_NAME = "ezber-content.sqlite"
    }
}
