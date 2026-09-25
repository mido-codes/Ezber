import Foundation

/// A reciter whose audio can be streamed or downloaded. The real content
/// pipeline will fill these from the content store; placeholder values are used
/// until it lands.
struct Reciter: Identifiable, Hashable, Codable {
    let id: String
    let name: String
    let style: String
    let languageName: String
    let sampleURL: URL?
    let audioBaseURL: URL?
    let license: String?

    init(
        id: String,
        name: String,
        style: String,
        languageName: String,
        sampleURL: URL? = nil,
        audioBaseURL: URL? = nil,
        license: String? = nil
    ) {
        self.id = id
        self.name = name
        self.style = style
        self.languageName = languageName
        self.sampleURL = sampleURL
        self.audioBaseURL = audioBaseURL
        self.license = license
    }
}
