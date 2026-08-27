# Workflow-Based Chat Implementation Guide

## Overview

This document explains the new workflow-based architecture and how to migrate from the existing complex plan-state system to the simplified workflow approach.

## What's New

### New File: `useWorkflowChat.ts`

A simplified alternative to `useRoamingChat.ts` that implements the workflow pattern:

**Key Differences:**

| Aspect | Old (`useRoamingChat`) | New (`useWorkflowChat`) |
|--------|----------------------|----------------------|
| State Model | `planState` (hasRoaming, hasInsurance, showToggle) + `currentView` | `workflowState` (currentStep, completedSteps) |
| View Switching | Yes (toggle between roaming/insurance) | No (linear chat flow) |
| Card Display | Filtered by `currentView` | All cards shown in order |
| Flow | Parallel agents with switching | Sequential: roaming → insurance |
| Progression | Manual (user clicks toggle) | Automatic (after confirmation) |

### Workflow State Structure

```typescript
type WorkflowState = {
  currentStep: 'roaming' | 'insurance' | 'complete';
  completedSteps: ('roaming' | 'insurance')[];
};
```

### Chat Flow

```
User opens chat for flight
    ↓
[Load flight details]
    ↓
[Show roaming plans] ← currentStep: 'roaming'
    ↓
User confirms roaming plan
    ↓
[Show roaming receipt + transition message]
    ↓
[Show insurance plans] ← currentStep: 'insurance', completedSteps: ['roaming']
    ↓
User purchases insurance (or clicks "Remind later")
    ↓
[Show insurance receipt + completion] ← currentStep: 'complete'
```

## Implementation Steps

### 1. Update ChatScreen (Mobile)

Replace `useRoamingChat` with `useWorkflowChat`:

```typescript
// OLD:
import { useRoamingChat } from '../hooks/useRoamingChat';
const { items, phase, confirm, decline, retry, sendMessage, handleInsurancePurchased, currentView, switchView, planState } = useRoamingChat(event);

// NEW:
import { useWorkflowChat } from '../hooks/useWorkflowChat';
const { items, phase, confirm, decline, retry, sendMessage, handleInsurancePurchased, workflowState } = useWorkflowChat(event);
```

**Remove from JSX:**
- Remove `{planState.showToggle && <toggleSection />}` rendering
- Remove toggle buttons (no more [Roaming] [Insurance] tabs)

### 2. Update ChatItemView (Mobile)

Remove view-mode filtering:

```typescript
// OLD:
case 'card':
  if (currentView !== 'roaming') return <View />;
  return <RecommendationCard card={item.card} />;

case 'travel_insurance':
  if (currentView !== 'insurance') return <View />;
  return <TravelInsuranceCardChat />;

// NEW:
case 'card':
  return <RecommendationCard card={item.card} />;

case 'travel_insurance':
  return <TravelInsuranceCardChat />;
```

**Remove props:**
- Remove `currentView?: ViewMode` prop
- Remove `onSwitchView?: (view: ViewMode) => void` prop
- Remove `planState?: PlanState` prop

### 3. Update chatThread.ts (Mobile)

Add handler for workflow progress events (optional, for future use):

```typescript
case 'workflow_step_started':
  return {
    ...item,
    kind: 'status',
    label: event.data.label,
    state: 'active',
  };

case 'workflow_step_completed':
  return {
    ...item,
    kind: 'status',
    label: event.data.label,
    state: 'done',
  };
```

### 4. Backend: Create Workflow Endpoint (Optional)

**Files created:**
- `backend/app/agents/workflow/state.py` - Workflow state model
- `backend/app/agents/workflow/graph.py` - Workflow graph (MVP version)
- `backend/app/agents/workflow/agent.py` - Workflow agent wrapper
- `backend/app/agents/workflow/manifest.yaml` - Manifest

Current implementation: MVP version that coordinates with existing roaming/insurance agents via the existing `/chat/stream` endpoint.

Future enhancement: Create dedicated `/chat/workflow-stream` endpoint that uses the workflow graph for coordinated agent execution.

## Migration Path

### Phase 1: Parallel Testing (Current)
- Keep existing `useRoamingChat` unchanged
- Add new `useWorkflowChat` in separate file
- Test `useWorkflowChat` with a feature flag or separate route

### Phase 2: Gradual Rollout
- Roll out `useWorkflowChat` to subset of users
- Collect feedback on workflow experience vs. toggle experience
- Monitor analytics for plan purchase rates

### Phase 3: Full Migration
- Switch all new users to `useWorkflowChat`
- Keep `useRoamingChat` for existing users (backward compat)
- Deprecate toggle-based flow

### Phase 4: Cleanup
- Remove `useRoamingChat` entirely
- Remove view switching logic from ChatScreen/ChatItemView
- Simplify types (remove ViewMode, PlanState)

## Key Behavioral Changes

### 1. Auto-Progression
After user confirms roaming plan → **automatically show insurance plans**
(No manual toggle needed)

### 2. Contextual Insurance Message
If roaming already purchased: "Insurance is set up. You're all set!"
If roaming NOT purchased: "Insurance is set up. Don't forget to set up roaming!"

### 3. Skip Option
After insurance, user can click "Remind later" to end workflow without buying
(Insurance remains available for purchase later)

### 4. Completion State
Both workflows complete when:
- Roaming purchased + Insurance purchased → "You're all set!"
- Roaming purchased + Insurance skipped → "Roaming ready, insurance available anytime"

## Testing Checklist

### Happy Path
- [ ] Open chat for new flight → see roaming plans
- [ ] Confirm roaming → see roaming receipt + insurance plans
- [ ] Purchase insurance → see insurance receipt + completion
- [ ] Verify items appear in correct order (no filtering)

### Partial Flow
- [ ] Confirm roaming → skip insurance with "Remind later"
- [ ] Verify completion without requiring insurance

### Existing Plans
- [ ] Open chat with roaming already purchased → skip to insurance
- [ ] Open chat with insurance already purchased → skip to roaming
- [ ] Open chat with both purchased → show completion

### Edge Cases
- [ ] Network error mid-stream → retry should continue from correct step
- [ ] Refresh page mid-workflow → state should be deterministic
- [ ] No plans found for destination → show appropriate message

## Benefits of Workflow Approach

1. **Simpler Mental Model**: Linear sequence instead of parallel toggle
2. **Natural Chat Flow**: Items appear in chronological order
3. **Easier to Extend**: Add more steps (accommodation, activities) later
4. **Better Analytics**: Clear funnel: roaming → insurance → complete
5. **Reduced State**: One `workflowState` vs. multiple (planState, currentView, etc.)
6. **Fewer Bugs**: No view-switching complexity, no filtering logic

## Future Enhancements

### Backend Workflow Orchestration
Implement full backend workflow graph that:
- Sequences agent execution
- Maintains conversation context across agents
- Emits workflow progress events
- Handles agent chaining

### Workflow Checkpoints
Add persistence so users can:
- Resume workflow after app crash
- Edit plan before final purchase
- See step history

### Multi-Step Workflows
Extend pattern to:
- Accommodation + Roaming + Insurance + Activities
- Holiday-specific workflows (beach trip vs. city vs. adventure)
- Budget-based plan recommendations

## Questions & Support

If you have questions about the workflow approach or implementation:
1. Check the test cases in `useWorkflowChat.ts`
2. Compare with `useRoamingChat.ts` to see what was removed
3. Review the chat flow diagram above
4. Refer back to the plan file: `plans/flight-events-from-gmail-piped-cherny.md`
