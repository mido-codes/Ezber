package app.ezber.android.persistence

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Opens `ezber-user.sqlite` in the app's private database directory using the
 * shared user schema from schema/user_schema.sql (see [UserSchema]).
 */
class UserDatabase(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    DATABASE_NAME,
    null,
    UserSchema.VERSION,
) {

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        UserSchema.create(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        UserSchema.migrate(db, oldVersion, newVersion)
    }

    companion object {
        /** File name promised by schema/README.md for cross-platform exports. */
        const val DATABASE_NAME = "ezber-user.sqlite"
    }
}
