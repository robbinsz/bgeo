package ruleengine

import (
	"testing"
)

func TestEvaluateCondition(t *testing.T) {
	evaluator := NewEvaluator()

	tests := []struct {
		name      string
		condition string
		env       map[string]interface{}
		expected  bool
	}{
		{
			name:      "Commercial intent match",
			condition: "query.intent == 'commercial'",
			env: map[string]interface{}{
				"query": map[string]interface{}{
					"intent": "commercial",
				},
			},
			expected: true,
		},
		{
			name:      "Rank gap threshold",
			condition: "gap.brand_rank > 2 && gap.score >= 80",
			env: map[string]interface{}{
				"gap": map[string]interface{}{
					"brand_rank": 3,
					"score":      85,
				},
			},
			expected: true,
		},
		{
			name:      "Condition not met",
			condition: "query.business_value > 90",
			env: map[string]interface{}{
				"query": map[string]interface{}{
					"business_value": 75,
				},
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := evaluator.EvaluateCondition(tt.condition, tt.env)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, got)
			}
		})
	}
}
