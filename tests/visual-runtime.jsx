import React from 'react'
import { createRoot } from 'react-dom/client'
import * as jsxRuntime from 'react/jsx-runtime'

// Browser-only rendering adapter for the production artifact, not a Host integration fixture.
window.bazaarVisualRuntime = { React, createRoot, jsxRuntime }
