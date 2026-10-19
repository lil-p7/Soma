# Soma - Posture Correction Tool

A webcam-based real-time posture monitoring and correction application built with React, MediaPipe, and Vite.

## Project Overview

Soma helps users maintain better posture while working or studying by using webcam pose estimation to detect body landmarks and provide real-time feedback on posture deviations.

## Features

### MVP Features

- **Webcam Access** - Request permission, start/stop camera, handle errors
- **Pose Landmark Detection** - MediaPipe Pose Landmarker detects shoulders, ears, nose, and hips
- **Posture Analysis Engine** - Calculate forward lean, slouching, and shoulder tilt
- **Live Feedback Dashboard** - Show current status, guidance, and landmark overlay
- **Persistent Posture Alerts** - Sustained deviation detection with cooldown
- **Session Tracking** - Elapsed time, posture states, and alert counts
- **Session Summary** - Proportion of time spent in each state
- **Settings** - Configure alert delay, sound, and camera preferences

### Posture Indicators

1. **Indicator A - Forward Head/Upper-Body Lean**: Head and shoulders forward relative to neutral
2. **Indicator B - Possible Slouching**: Upper-body inclination from shoulders to hips
3. **Indicator C - Shoulder Tilt**: Vertical position difference between left and right shoulders

### State Machine

- `CALIBRATING` - Establishing the user's baseline
- `GOOD` - No configured deviation currently detected
- `WARNING` - A possible deviation has persisted long enough
- `NO_POSE` - Required landmarks are not reliably visible
- `PAUSED` - Monitoring has been stopped temporarily

## Technology Stack

- **Frontend**: React + Vite
- **Pose Estimation**: MediaPipe Pose Landmarker
- **Language**: JavaScript/TypeScript
- **Styling**: CSS (with custom properties)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

## How It Works

1. **Webcam Input**: User grants camera permission, live video stream displayed
2. **Pose Estimation**: MediaPipe Pose Landmarker processes video frames
3. **Posture Analysis**: Landmark data converted to geometric features (angles, displacements)
4. **Feedback**: Status indicators and alerts based on calibrated thresholds
5. **Session Analytics**: Time spent in each posture state tracked and summarized

## Configuration

Default thresholds (in degrees, relative to user's calibrated baseline):

- **Forward Lean**: 12° threshold
- **Slouching (Torso Inclination)**: 12° threshold  
- **Shoulder Tilt**: 10° threshold
- **Alert Delay**: 5 seconds sustained deviation
- **Cooldown**: 10 seconds between alerts
- **Recovery Threshold**: 2° to clear warning

## Project Structure

```
soma/
├── public/
│   └── models/          (Pose Landmarker model files)
├── src/
│   ├── components/      # UI components
│   │   └── CameraPanel.jsx
│   ├── hooks/          # Custom React hooks
│   │   ├── useWebcam.js
│   │   ├── usePoseLandmarker.js
│   │   └── usePostureStateMachine.js
│   ├── logic/          # Core business logic
│   │   ├── postureAnalyzer.js
│   │   └── calibration.js
│   ├── services/       # Services (future: storage, etc.)
│   ├── utils/          # Utilities
│   │   ├── geometry.js
│   │   └── time.js
│   ├── pages/          # Page components
│   ├── App.jsx         # Main application component
│   ├── main.jsx        # Entry point
│   └── index.css       # Global styles
└── package.json
```

## Development Roadmap

Week 1-2: Project setup, interface, webcam integration
Week 3: MediaPipe Pose Landmarker integration
Week 4: Posture analysis engine
Week 5: Real-time feedback and alerts
Week 6: Session tracking and analytics
Week 7: Testing and usability improvements
Week 8: Deployment and documentation

## Limitations

- Pose estimation accuracy affected by camera positioning, lighting, clothing
- Designed for single user, upper body visible
- Not a medical diagnostic tool
- Front-facing webcam limited for depth perception
- Calibration user-dependent

## License

This project is for demonstration and educational purposes.