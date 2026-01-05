local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local animationsDisabled = false

local gui = Instance.new("ScreenGui")
gui.Name = "AnimationToggleGUI"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local button = Instance.new("TextButton")
button.Parent = gui
button.Size = UDim2.new(0, 170, 0, 50)
button.Position = UDim2.new(0.5, -85, 0.8, 0)
button.Text = "Animations: ON"
button.BackgroundColor3 = Color3.fromRGB(35, 35, 35)
button.TextColor3 = Color3.fromRGB(255, 255, 255)
button.TextScaled = true
button.BorderSizePixel = 0
button.Active = true

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = button

local dragging = false
local dragStart
local startPos

button.InputBegan:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		dragging = true
		dragStart = input.Position
		startPos = button.Position
	end
end)

button.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		dragging = false
	end
end)

UserInputService.InputChanged:Connect(function(input)
	if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
		local delta = input.Position - dragStart
		button.Position = UDim2.new(
			startPos.X.Scale,
			startPos.X.Offset + delta.X,
			startPos.Y.Scale,
			startPos.Y.Offset + delta.Y
		)
	end
end)

local function disableAnimations()
	local character = player.Character or player.CharacterAdded:Wait()
	local humanoid = character:FindFirstChildOfClass("Humanoid")

	if humanoid then
		local animator = humanoid:FindFirstChildOfClass("Animator")
		if animator then
			for _, track in pairs(animator:GetPlayingAnimationTracks()) do
				track:Stop()
			end
		end
	end

	local animate = character:FindFirstChild("Animate")
	if animate then
		animate.Disabled = true
	end
end

local function enableAnimations()
	local character = player.Character or player.CharacterAdded:Wait()
	local animate = character:FindFirstChild("Animate")

	if animate then
		animate.Disabled = false
	end
end

button.MouseButton1Click:Connect(function()
	animationsDisabled = not animationsDisabled

	if animationsDisabled then
		disableAnimations()
		button.Text = "Animations: OFF"
		button.BackgroundColor3 = Color3.fromRGB(120, 40, 40)
	else
		enableAnimations()
		button.Text = "Animations: ON"
		button.BackgroundColor3 = Color3.fromRGB(35, 35, 35)
	end
end)
