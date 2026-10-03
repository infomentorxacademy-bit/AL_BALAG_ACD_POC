group = "com.albalag.zoom_meeting_bridge"
version = "0.1.0"

buildscript {
    repositories {
        google()
        mavenCentral()
    }

    dependencies {
        classpath("com.android.tools.build:gradle:9.1.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

plugins {
    id("com.android.library")
}

android {
    namespace = "com.albalag.zoom_meeting_bridge"

    compileSdk = 36

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        // Zoom's meeting screens are built with ViewBinding. Enabling it here adds
        // androidx.databinding:viewbinding to the app, otherwise Zoom's ZmConfActivity crashes with
        // "NoClassDefFoundError: androidx.viewbinding.ViewBinding" as soon as a meeting starts.
        // (Zoom's own React Native wrapper enables the same flag.)
        viewBinding = true
    }

    defaultConfig {
        // The Zoom Meeting SDK requires API 28+.
        minSdk = 28
        consumerProguardFiles("consumer-rules.pro")
    }
}

dependencies {
    // The official SDK's POM declares all of its transitive dependencies, so one line is enough.
    implementation("us.zoom.meetingsdk:zoomsdk:7.0.5")

    // Zoom's join screens (Jetpack Compose) are built against Compose 1.9.4 (see the versions.gradle of
    // Zoom's own React Native wrapper). Its POM only pulls foundation/animation 1.8.1, which lacks methods
    // Zoom calls (NoSuchMethodError: ToggleableKt.toggleable) and crashes the app on Join. Gradle always
    // takes the highest requested version, so listing 1.9.4 here upgrades them.
    val compose = "1.9.4"
    implementation("androidx.compose.foundation:foundation:$compose")
    implementation("androidx.compose.foundation:foundation-layout:$compose")
    implementation("androidx.compose.animation:animation:$compose")
    implementation("androidx.compose.animation:animation-core:$compose")
    implementation("androidx.compose.material:material-ripple:$compose")
}
