import pandas as pd

# Load the Jigsaw toxic comments dataset
data = pd.read_csv("jigsaw-toxic-comment-train.csv")

# Create 'label' column: offensive if any toxic category is 1, else normal
data['label'] = data[['toxic','severe_toxic','obscene','threat','insult','identity_hate']].max(axis=1)
data['label'] = data['label'].apply(lambda x: 'offensive' if x == 1 else 'normal')

# Keep only message and label
dataset = data[['comment_text', 'label']]
dataset.rename(columns={'comment_text': 'message'}, inplace=True)

# Save cleaned dataset
dataset.to_csv("feedback_dataset.csv", index=False)

print("Prepared dataset saved as feedback_dataset.csv")