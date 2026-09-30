package usecase

import (
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/connector/ai"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/ruleengine"
	"gorm.io/gorm"
)

func NewWorker(db *gorm.DB, cfg config.Config, hub *ws.Hub) *Worker {
	project := repository.NewProjectRepository(db)
	monitor := repository.NewMonitorRepository(db)
	opportunity := repository.NewOpportunityRepository(db)
	content := repository.NewContentRepository(db)
	monitorUC := NewMonitorUsecase(monitor, opportunity, ai.NewPerplexityConnector(), hub)
	copilot := NewCopilotUsecase(repository.NewCopilotRepository(db), repository.NewHarnessRepository(db), monitorUC, NewContentUsecase(content, project), monitor, opportunity, project, content, hub)
	return &Worker{DB: db, Jobs: repository.NewJobRepository(db), Monitor: monitorUC, Evolution: NewEvolutionUsecase(repository.NewEvolutionRepository(db), ruleengine.NewEvaluator(), hub), Copilot: copilot, Config: cfg}
}
