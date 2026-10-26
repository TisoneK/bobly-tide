allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// smile_id 10.4.3 declares its AndroidX/Compose dependencies *without versions*
// (its build.gradle expects the host app to supply a BOM). A freshly generated
// Flutter project has none, so Gradle fails with
// "Could not find androidx.compose.material3:material3:." Pin them here instead
// of vendoring a patched plugin. Revisit when smile_id is upgraded (ADR-25).
subprojects {
    if (name == "smile_id") {
        configurations.configureEach {
            resolutionStrategy {
                force(
                    "androidx.core:core-ktx:1.15.0",
                    "androidx.fragment:fragment-ktx:1.8.5",
                    "androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7",
                    "androidx.compose.ui:ui:1.7.6",
                    "androidx.compose.material3:material3:1.3.1",
                    "org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0",
                )
            }
        }
    }
}

// LiteRT 1.0.1 (pulled transitively by Smile ID's ML Kit object detection)
// ships both litert-support and litert-support-api with the same
// `org.tensorflow.lite.support` namespace, which AGP's manifest merger rejects
// ("used in multiple modules"). Keep the implementation artifact and drop the
// duplicate API one. Revisit when smile_id / ML Kit upgrades the dependency.
subprojects {
    configurations.configureEach {
        exclude(group = "com.google.ai.edge.litert", module = "litert-support-api")
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
