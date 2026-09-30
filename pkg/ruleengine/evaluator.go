package ruleengine

import (
	"fmt"

	"github.com/expr-lang/expr"
)

// Evaluator evaluates dynamic AST conditions using expr-lang/expr
type Evaluator struct{}

func NewEvaluator() *Evaluator {
	return &Evaluator{}
}

// EvaluateCondition evaluates a boolean expression condition string against input context map
func (e *Evaluator) EvaluateCondition(condition string, env map[string]interface{}) (bool, error) {
	if condition == "" {
		return true, nil
	}

	program, err := expr.Compile(condition, expr.Env(env), expr.AsBool())
	if err != nil {
		return false, fmt.Errorf("failed to compile condition '%s': %w", condition, err)
	}

	output, err := expr.Run(program, env)
	if err != nil {
		return false, fmt.Errorf("failed to run condition '%s': %w", condition, err)
	}

	result, ok := output.(bool)
	if !ok {
		return false, fmt.Errorf("condition result is not boolean")
	}

	return result, nil
}
