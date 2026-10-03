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

    defaultConfig {
        // The Zoom Meeting SDK requires API 28+.
        minSdk = 28
        consumerProguardFiles("consumer-rules.pro")
    }
}

dependencies {
    // The official SDK's POM declares all of its transitive dependencies, so one line is enough.
    implementation("us.zoom.meetingsdk:zoomsdk:7.0.5")
}
