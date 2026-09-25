package app.ezber.android.services

import app.ezber.android.models.Iso8601

/** A voice memo captured while driving and transcribed later. */
data class VoiceMemo(
    val filePath: String,
    val durationMs: Long,
    val createdAt: String,
)

/**
 * Interface for verse voice memos. This slice ships only a stub that records
 * nothing and requests no microphone permission; the real implementation will
 * write audio files and queue transcription.
 */
interface VoiceMemoService {
    val isRecording: Boolean
    fun startRecording()
    fun stopRecording(): VoiceMemo?
}

/** Records nothing, returns a placeholder memo so the notes flow stays clickable. */
class StubVoiceMemoService : VoiceMemoService {

    override var isRecording: Boolean = false
        private set

    override fun startRecording() {
        isRecording = true
    }

    override fun stopRecording(): VoiceMemo? {
        isRecording = false
        return VoiceMemo(
            filePath = "voice-memos/memo-${System.currentTimeMillis()}.m4a",
            durationMs = 0L,
            createdAt = Iso8601.now(),
        )
    }
}
