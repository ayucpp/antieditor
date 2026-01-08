# AntiEditor Features

A comprehensive list of all features available in the AntiEditor video editing application.

## Core Features

### 1. Media Upload & Management

- **Drag & Drop Upload**: Support for dragging and dropping video/audio files directly into the editor
- **Multiple File Upload**: Ability to upload multiple media files at once
- **File Type Support**: Accepts both video and audio files
- **Media List/Project Bin**: Visual display of all uploaded media clips with metadata
- **Metadata Extraction**: Automatic extraction of video properties (duration, resolution, FPS)
- **Media Normalization**: Automatic normalization of resolution and frame rate for uploaded media

### 2. Natural Language Processing

- **LLM-Powered Prompt Parsing**: Uses OpenAI or Google Gemini to parse natural language editing requests
- **Intent Extraction**: Converts natural language prompts into structured editing intents
- **Context-Aware Processing**: Uses video metadata (duration, resolution) to interpret relative time references
- **Smart Time Resolution**: Automatically calculates absolute timestamps from relative references (e.g., "last 30 seconds")
- **Mock/Fallback Mode**: Heuristic-based parsing when LLM API is unavailable
- **Prompt Suggestions**: Pre-defined suggestion chips for common editing operations

### 3. Video Editing Operations

#### Trimming & Cutting
- **Trim Video**: Remove portions from start or end of video
- **Time Range Selection**: Specify exact start and end times for trimming
- **Remove Segments**: Cut out specific time ranges from the middle of videos
- **Relative Time References**: Support for "first X seconds", "last X seconds" in prompts

#### Audio Operations
- **Silence Removal**: Automatically detect and remove silent segments
- **Audio Swapping**: Swap audio between two time segments (complex multi-segment operation)
- **Audio Volume Control**: Adjust audio levels (via prompts)

#### Video Filters & Effects
- **Cinematic Filter**: Apply cinematic color grading (enhanced contrast and saturation)
- **Grayscale Filter**: Convert video to black and white
- **Video Reverse**: Reverse entire video or specific time segments
- **Speed Adjustment**: Change playback speed (slow motion, fast forward) with time range support
- **Partial Effects**: Apply effects to specific time ranges within the video

#### Format & Resolution
- **Aspect Ratio Conversion**: 
  - 9:16 (Vertical/Reels format)
  - 1:1 (Square format)
  - 16:9 (Landscape format)
- **Smart Cropping**: Center-crop videos to maintain aspect ratio
- **Resolution Normalization**: Automatic format standardization

#### Subtitles
- **Subtitle Generation**: Generate subtitle files (SRT format) for videos
- **Subtitle Overlay**: Burn subtitles directly onto video output

### 4. User Interface Features

#### Three-Panel Layout
- **Left Panel**: Input controls (upload, prompt panel, media list)
- **Center Panel**: Video preview with playback controls
- **Right Panel**: System intelligence (interpretation, logs, progress)

#### Video Preview
- **Video Player**: Full-featured HTML5 video player
- **Play/Pause Controls**: Click-to-play functionality
- **Before/After Toggle**: Switch between original and edited versions
- **Processing Overlay**: Visual feedback during video processing
- **Progress Indicator**: Real-time progress bar with percentage

#### Playback Timeline
- **Interactive Timeline**: Click or drag to seek through video
- **Time Display**: Current time and total duration display
- **Playhead Indicator**: Visual playhead that appears on hover
- **Semantic Overlays**: Visual indicators for speech and silent segments
- **Time Formatting**: Human-readable time format (MM:SS)

#### History Management
- **Undo/Redo**: Navigate through editing history
- **History Counter**: Display current position in history (e.g., "2 / 5")
- **History Persistence**: Maintains job IDs and URLs for each edit step
- **Non-Destructive Editing**: Original video preserved throughout editing chain

#### System Intelligence Panel
- **Prompt Interpretation**: Display of parsed intent in JSON format
- **FFmpeg Command Preview**: Shows the generated FFmpeg command
- **Execution Logs**: Real-time log output during processing
- **Progress Tracking**: Visual progress bar with percentage
- **Status Updates**: Live updates on processing stages

### 5. Backend Processing

#### Job Management
- **Job-Based System**: Each editing operation creates a unique job
- **Job Chaining**: Output of one job becomes input for the next
- **Job Status Tracking**: Monitor job status (pending, processing, completed, failed)
- **Job ID Persistence**: Maintains job IDs across editing sessions

#### Video Processing
- **FFmpeg Integration**: Uses FFmpeg for all video processing operations
- **Async Processing**: Non-blocking video processing
- **Progress Monitoring**: Real-time progress updates via FFmpeg output parsing
- **Error Handling**: Comprehensive error logging and status reporting

#### API Endpoints
- **Upload Endpoint**: POST endpoint for video uploads
- **Parse Prompt**: POST endpoint for LLM-based prompt parsing
- **Process Video**: POST endpoint to start video processing
- **Status Check**: GET endpoint to poll job status
- **Download**: GET endpoint to download processed videos

#### Validation & Safety
- **Intent Validation**: Zod schema validation for all editing intents
- **Strict Schema Enforcement**: Prevents invalid or malformed intents
- **Error Messages**: Helpful error messages for validation failures

### 6. Advanced Features

#### Multi-Engine Support
- **Legacy Engine**: Original processing engine (v1)
- **DaVinci Engine v2**: Advanced graph-based processing architecture
- **V2 Lab**: Testing interface for v2 engine features

#### Audio Feedback
- **Notification Sounds**: Audio feedback when processing completes (v2)

#### Keyboard Shortcuts
- **Execute Prompt**: Cmd/Ctrl + Enter to execute editing prompt

#### Real-Time Updates
- **Status Polling**: Automatic polling for job status updates
- **Live Logs**: Streaming execution logs during processing
- **Progress Updates**: Continuous progress percentage updates

### 7. Technical Capabilities

#### LLM Integration
- **Multi-Provider Support**: OpenAI and Google Gemini support
- **Configurable Models**: Environment-based model selection
- **Rate Limiting Handling**: Automatic retry with exponential backoff
- **Fallback Mechanisms**: Mock parsing when API unavailable

#### FFmpeg Operations
- **Complex Filter Chains**: Support for multi-segment operations
- **Video Filtering**: Color correction, effects, and transformations
- **Audio Filtering**: Silence removal, speed adjustment, reversal
- **Subtitle Burning**: Hardcoded subtitle overlay
- **Format Conversion**: MP4 export with optimized settings

#### Metadata Handling
- **FFprobe Integration**: Extract video metadata (duration, resolution, codec, etc.)
- **Metadata Refresh**: Re-probe metadata after each editing operation
- **Context Propagation**: Pass metadata to LLM for better prompt interpretation

## Feature Categories Summary

### Editing Operations
- Trim, Cut, Remove segments
- Audio swapping
- Silence removal
- Video filters (cinematic, grayscale)
- Speed adjustment
- Video reversal
- Aspect ratio conversion
- Subtitle generation

### User Experience
- Drag & drop upload
- Natural language editing
- Before/after comparison
- History navigation (undo/redo)
- Real-time progress tracking
- Interactive timeline
- Semantic visualization

### Technical Infrastructure
- Job-based processing
- Async operations
- LLM integration
- FFmpeg pipeline
- Intent validation
- Error handling
- Status monitoring

## Version Information

- **Main Editor**: Full-featured editing interface with history management
- **V2 Editor**: DaVinci Engine with graph-based architecture
- **V2 Lab**: Testing and development interface for v2 features

---

*Note: This feature list excludes the v2_engine directory as requested.*

